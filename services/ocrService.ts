// OCR Service using Tesseract.js (Client-side OCR)
// Best-in-class OCR with image preprocessing and optimized settings
// Extracts text and structured information from visiting cards and screenshots

import { createWorker } from 'tesseract.js';
import { parseLeadDataFromText as parseVisitingCardText } from '../utils/parseVisitingCard';

console.log('🔧 OCR Service loaded');

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

// Advanced image preprocessing for better OCR accuracy
const preprocessImage = (imageFile: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    if (!ctx) {
      reject(new Error('Canvas context not available'));
      return;
    }

    img.onload = () => {
      try {
        // Set canvas size
        canvas.width = img.width;
        canvas.height = img.height;
        
        // Draw original image
        ctx.drawImage(img, 0, 0);
        
        // Get image data
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        
        // Apply preprocessing: Grayscale + Contrast Enhancement + Noise Reduction
        for (let i = 0; i < data.length; i += 4) {
          // Convert to grayscale using luminance formula
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          const gray = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
          
          // Enhance contrast (increase difference between light and dark)
          let enhanced = gray;
          if (gray < 128) {
            // Darken dark pixels
            enhanced = Math.max(0, gray - 20);
          } else {
            // Lighten light pixels
            enhanced = Math.min(255, gray + 20);
          }
          
          // Apply threshold to make text sharper (binary threshold)
          const threshold = 128;
          const binary = enhanced > threshold ? 255 : 0;
          
          // Set RGB to grayscale value
          data[i] = binary;     // R
          data[i + 1] = binary; // G
          data[i + 2] = binary; // B
          // Alpha stays the same
        }
        
        // Put processed image data back
        ctx.putImageData(imageData, 0, 0);
        
        // Convert to blob and then to file
        canvas.toBlob((blob) => {
          if (!blob) {
            reject(new Error('Failed to process image'));
            return;
          }
          
          // Convert blob to data URL
    const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = () => reject(new Error('Failed to read processed image'));
          reader.readAsDataURL(blob);
        }, 'image/png');
      } catch (error) {
        reject(error);
      }
    };
    
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = URL.createObjectURL(imageFile);
  });
};

// Extract text from image using Tesseract.js with optimal settings
export const extractTextFromImage = async (
  imageFile: File,
  onProgress?: (message: string, percent?: number) => void
): Promise<string> => {
  let worker: any = null;
  try {
    console.log('🔍 Starting high-accuracy OCR extraction...');
    onProgress?.('Preparing image for text reading...', 8);

    console.log('🖼️ Preprocessing image (grayscale, contrast, threshold)...');
    const processedImageDataUrl = await preprocessImage(imageFile);
    
    const response = await fetch(processedImageDataUrl);
    const blob = await response.blob();
    const processedFile = new File([blob], imageFile.name, { type: 'image/png' });

    onProgress?.('Loading OCR engine...', 15);
    
    worker = await createWorker('eng', 1, {
      logger: (m: any) => {
        if (m.status === 'recognizing text') {
          const percent = Math.round((m.progress || 0) * 100);
          onProgress?.(`Reading text from image… ${percent}%`, 20 + Math.round(percent * 0.6));
        } else if (m.status) {
          onProgress?.(`OCR: ${String(m.status).replace(/_/g, ' ')}`, 18);
        }
      },
    });
    
    console.log('✅ Tesseract worker created');
    
    // Set optimal parameters for business card OCR
    // PSM 6 = Assume a single uniform block of text (best for business cards)
    // PSM 11 = Sparse text (alternative if 6 doesn't work well)
    await worker.setParameters({
      tessedit_pageseg_mode: '6', // Uniform text block
      tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789@.-+()/:, ', // Common characters
    });
    
    console.log('🔍 Recognizing text with optimized settings...');
    
    // Perform OCR on preprocessed image
    const { data: { text } } = await worker.recognize(processedFile);
    
    // If first attempt yields poor results, try with different PSM mode
    let finalText = text.trim();
    if (!finalText || finalText.length < 10) {
      console.log('⚠️ First OCR attempt yielded poor results, trying alternative mode...');
      await worker.setParameters({
        tessedit_pageseg_mode: '11', // Sparse text
      });
      const retryResult = await worker.recognize(processedFile);
      if (retryResult.data.text && retryResult.data.text.length > finalText.length) {
        finalText = retryResult.data.text.trim();
        console.log('✅ Retry with alternative mode improved results');
      }
    }
    
    if (!finalText || finalText.length === 0) {
      throw new Error('No text could be extracted from the image. Please ensure the image is clear and contains readable text.');
    }
    
    // Post-process text to fix common OCR errors
    finalText = fixCommonOCRErrors(finalText);
    
    console.log('✅ OCR extraction completed');
    return finalText;
  } catch (error) {
    console.error('❌ Error extracting text from image:', error);
    
    // Provide more helpful error messages
    if (error instanceof Error) {
      if (error.message.includes('worker') || error.message.includes('load') || error.message.includes('fetch')) {
        throw new Error('Failed to load OCR engine. Please check your internet connection and try again.');
      }
      if (error.message.includes('language') || error.message.includes('eng') || error.message.includes('traineddata')) {
        throw new Error('Failed to load OCR language data. Please check your internet connection and refresh the page.');
      }
      if (error.message.includes('No text')) {
        throw error;
      }
      throw new Error(`OCR Error: ${error.message}`);
    }
    throw new Error('Failed to extract text from image. Please ensure the image is clear and contains readable text.');
  } finally {
    // Always terminate worker to free resources
    if (worker) {
      try {
        await worker.terminate();
        console.log('✅ Worker terminated');
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