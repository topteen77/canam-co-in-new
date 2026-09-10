// OCR Service using Tesseract.js (Client-side OCR)
// Best-in-class OCR with image preprocessing and optimized settings
// Extracts text and structured information from visiting cards and screenshots

import { createWorker } from 'tesseract.js';
import { parseLeadDataFromText as parseVisitingCardText } from '../utils/parseVisitingCard';

console.log('🔧 OCR Service loaded');

const OCR_LOAD_MS = 45000;
const OCR_RECOGNIZE_MS = 60000;
const OCR_MAX_SIDE_MOBILE = 1100;
const OCR_MAX_SIDE_DESKTOP = 1400;

export class OcrCancelledError extends Error {
  constructor(message = 'OCR cancelled') {
    super(message);
    this.name = 'OcrCancelledError';
  }
}

const isMobileClient = (): boolean => {
  if (typeof navigator === 'undefined') return false;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) ||
    (typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches);
};

const throwIfAborted = (signal?: AbortSignal) => {
  if (signal?.aborted) throw new OcrCancelledError();
};

const withTimeout = async <T>(
  promise: Promise<T>,
  ms: number,
  message: string,
  signal?: AbortSignal
): Promise<T> => {
  throwIfAborted(signal);
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener('abort', onAbort);
      reject(new Error(message));
    }, ms);
    const onAbort = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new OcrCancelledError());
    };
    signal?.addEventListener('abort', onAbort, { once: true });
    promise.then(
      (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
        reject(err);
      }
    );
  });
};

const downscaleForOcr = async (file: File, maxSide: number): Promise<Blob> => {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file);
      const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
      if (scale >= 0.98) {
        bitmap.close();
        return file;
      }
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(2, Math.round(bitmap.width * scale));
      canvas.height = Math.max(2, Math.round(bitmap.height * scale));
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        bitmap.close();
        return file;
      }
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close();
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.82));
      return blob || file;
    } catch {
      return file;
    }
  }
  return file;
};

export interface ExtractedLeadData {
  agencyName?: string;
  contactName?: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  alternateMobile?: string;
  pocDesignation?: string;
  websiteLink?: string;
  remarks?: string;
}

// Extract text from image using Tesseract.js with optimal settings
export const extractTextFromImage = async (
  imageFile: File,
  onProgress?: (message: string, percent?: number) => void,
  signal?: AbortSignal
): Promise<string> => {
  let worker: any = null;
  const mobile = isMobileClient();
  try {
    throwIfAborted(signal);
    console.log('🔍 Starting OCR on scan-enhanced color image (no binary threshold)…');
    onProgress?.('Preparing a smaller image for OCR…', 8);
    const ocrSource = await downscaleForOcr(imageFile, mobile ? OCR_MAX_SIDE_MOBILE : OCR_MAX_SIDE_DESKTOP);
    throwIfAborted(signal);

    onProgress?.('Loading OCR engine (first time may take a minute)…', 12);
    const workerPromise = createWorker('eng', 1, {
      logger: (m: any) => {
        if (signal?.aborted) return;
        if (m.status === 'recognizing text') {
          const percent = Math.round((m.progress || 0) * 100);
          onProgress?.(`Reading text from image… ${percent}%`, 20 + Math.round(percent * 0.6));
        } else if (m.status) {
          const status = String(m.status).replace(/_/g, ' ');
          onProgress?.(`OCR: ${status}`, 14);
        }
      },
      errorHandler: (err: unknown) => {
        console.warn('Tesseract worker error:', err);
      }
    });
    workerPromise.then((created) => {
      worker = created;
    }).catch(() => {});
    try {
      worker = await withTimeout(
        workerPromise,
        OCR_LOAD_MS,
        'OCR engine took too long to load. Check your connection and try again.',
        signal
      );
    } catch (loadError) {
      workerPromise.then((created) => {
        created.terminate().catch(() => {});
      }).catch(() => {});
      throw loadError;
    }

    throwIfAborted(signal);
    await worker.setParameters({
      tessedit_pageseg_mode: '6',
      preserve_interword_spaces: '1'
    });

    onProgress?.('Reading text from image…', 22);
    const { data: { text } } = await withTimeout(
      worker.recognize(ocrSource),
      OCR_RECOGNIZE_MS,
      'OCR is taking too long on this device. Crop closer to the card and try again.',
      signal
    );

    let finalText = (text || '').trim();
    if (!mobile && (!finalText || finalText.length < 10)) {
      onProgress?.('Trying a second OCR pass…', 70);
      await worker.setParameters({ tessedit_pageseg_mode: '11' });
      const retryResult = await withTimeout(
        worker.recognize(ocrSource),
        OCR_RECOGNIZE_MS,
        'OCR is taking too long on this device. Crop closer to the card and try again.',
        signal
      );
      if (retryResult.data.text && retryResult.data.text.length > finalText.length) {
        finalText = retryResult.data.text.trim();
      }
    }

    if (!finalText) {
      throw new Error('No text could be extracted from the image. Please ensure the image is clear and contains readable text.');
    }

    finalText = fixCommonOCRErrors(finalText);
    console.log('✅ OCR extraction completed');
    return finalText;
  } catch (error) {
    if (error instanceof OcrCancelledError || (error instanceof Error && error.name === 'OcrCancelledError')) {
      throw error;
    }
    console.error('❌ Error extracting text from image:', error);
    if (error instanceof Error) {
      if (error.message.includes('too long') || error.message.includes('connection')) throw error;
      if (error.message.includes('worker') || error.message.includes('load') || error.message.includes('fetch')) {
        throw new Error('Failed to load OCR engine. Please check your internet connection and try again.');
      }
      if (error.message.includes('language') || error.message.includes('eng') || error.message.includes('traineddata')) {
        throw new Error('Failed to load OCR language data. Please check your internet connection and refresh the page.');
      }
      if (error.message.includes('No text')) throw error;
      throw new Error(`OCR Error: ${error.message}`);
    }
    throw new Error('Failed to extract text from image. Please ensure the image is clear and contains readable text.');
  } finally {
    if (worker) {
      try {
        await worker.terminate();
      } catch (terminateError) {
        console.warn('⚠️ Error terminating worker:', terminateError);
      }
    }
  }
};

// Fix common OCR errors
const fixCommonOCRErrors = (text: string): string => {
  let fixed = text;
  
  // Fix common character misrecognitions
  // Fix rn -> m (common OCR error in words)
  fixed = fixed.replace(/rn(?=[a-z])/gi, 'm');
  
  // Fix vv -> w
  fixed = fixed.replace(/vv/gi, 'w');
  
  // Fix cl -> d (in certain contexts)
  fixed = fixed.replace(/cl(?=[a-z])/gi, 'd');
  
  // Keep line breaks so name, title, and address stay on separate lines
  fixed = fixed.replace(/[^\S\n]+/g, ' ');
  fixed = fixed.replace(/([a-z])([A-Z])/g, '$1 $2');
  
  // Fix common number/letter confusions in context
  // This is done more carefully to avoid breaking valid text
  fixed = fixed.replace(/\b([A-Z])[|1]([a-z])/g, '$1I$2'); // | or 1 between letters -> I
  
  return fixed.trim();
};

// Parse extracted text to structured lead data with enhanced parsing
export const parseLeadDataFromText = async (extractedText: string): Promise<ExtractedLeadData> => {
  return parseVisitingCardText(extractedText);
};


// Main function: Extract and parse lead data from image
export const extractLeadFromImage = async (imageFile: File): Promise<ExtractedLeadData> => {
  try {
    console.log('🚀 Starting high-accuracy OCR extraction process...');
    
    // Step 1: Extract text from image with preprocessing
    const extractedText = await extractTextFromImage(imageFile);
    
    if (!extractedText || extractedText.trim().length === 0) {
      throw new Error('No text could be extracted from the image. Please ensure the image is clear and contains readable text.');
    }

    console.log('📝 Extracted text:', extractedText.substring(0, 300) + '...');

    // Step 2: Parse text to structured data with advanced parsing
    const leadData = await parseLeadDataFromText(extractedText);
    
    console.log('✅ OCR extraction completed successfully');
    return leadData;
  } catch (error) {
    console.error('❌ Error extracting lead from image:', error);
    throw error;
  }
};