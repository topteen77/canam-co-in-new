import type { ExtractedLeadData } from './ocrService';
import { assessImageQuality } from '../utils/imageQuality';
import { normalizeExtractedFields } from '../utils/parseVisitingCard';

export type ExtractionSource = 'llm' | 'ocr';

export type ProcessUpdate = {
  step: 'open' | 'quality' | 'ai' | 'ocr' | 'map' | 'done';
  label: string;
  percent?: number;
};

export type VisitingCardExtraction = {
  source: ExtractionSource;
  fields: ExtractedLeadData;
  rawText: string;
  isClearlyVisible: boolean;
  qualityIssues: string[];
};

export class ImageNotClearError extends Error {
  qualityIssues: string[];
  constructor(issues: string[]) {
    super(issues[0] || 'This image is not clearly visible. Please take another photo.');
    this.name = 'ImageNotClearError';
    this.qualityIssues = issues;
  }
}

const hasUsefulFields = (fields: ExtractedLeadData): boolean =>
  Boolean(
    fields.agencyName ||
    fields.contactName ||
    fields.phone ||
    fields.email ||
    fields.address ||
    fields.city ||
    fields.websiteLink
  );

export const extractVisitingCard = async (
  imageFile: File,
  onStatus?: (update: ProcessUpdate) => void
): Promise<VisitingCardExtraction> => {
  console.info('[Visiting card] Starting extraction for', imageFile.name || 'uploaded image');
  onStatus?.({ step: 'quality', label: 'Checking if the image is clearly visible…', percent: 12 });
  const quality = await assessImageQuality(imageFile);
  if (!quality.isClearlyVisible) {
    console.warn('[Visiting card] Image not clearly visible. Engine not used.', quality.issues);
    throw new ImageNotClearError(quality.issues);
  }

  try {
    const { isLLMConfigured, extractLeadFromImageWithLLM } = await import('./geminiService');
    if (isLLMConfigured()) {
      console.info('[Visiting card] Engine: LLM (Gemini). Reading image with AI…');
      onStatus?.({ step: 'ai', label: 'Reading visiting card with AI…', percent: 35 });
      const llm = await extractLeadFromImageWithLLM(imageFile);
      onStatus?.({ step: 'map', label: 'Matching AI results to form fields…', percent: 85 });
      if (!llm.isClearlyVisible) {
        const issues = llm.qualityIssues.length
          ? llm.qualityIssues
          : ['The text on this image is not clearly visible. Please take another photo and try again.'];
        console.warn('[Visiting card] Engine: LLM. Image not clearly visible.', issues);
        throw new ImageNotClearError(issues);
      }
      const fields = normalizeExtractedFields(llm.fields);
      if (!hasUsefulFields(fields) && !(llm.rawText || '').trim()) {
        throw new ImageNotClearError([
          'No client information could be read from this image. Please take a clearer photo.'
        ]);
      }
      onStatus?.({ step: 'done', label: 'AI finished. Filling the form…', percent: 100 });
      console.info('[Visiting card] Engine used: LLM', {
        engine: 'LLM',
        source: 'llm',
        fields
      });
      return {
        source: 'llm',
        fields,
        rawText: llm.rawText,
        isClearlyVisible: true,
        qualityIssues: []
      };
    }
    console.info('[Visiting card] LLM not configured (no valid GEMINI_API_KEY). Using OCR.');
  } catch (error) {
    if (error instanceof ImageNotClearError) throw error;
    console.warn('[Visiting card] LLM failed. Falling back to OCR.', error);
    onStatus?.({ step: 'ocr', label: 'AI unavailable. Switching to OCR…', percent: 30 });
  }

  console.info('[Visiting card] Engine: OCR (Tesseract). Extracting text…');
  onStatus?.({ step: 'ocr', label: 'Extracting text with OCR…', percent: 35 });
  const ocrService = await import('./ocrService');
  const rawText = await ocrService.extractTextFromImage(imageFile, (message, percent) => {
    onStatus?.({ step: 'ocr', label: message, percent });
  });
  if (!rawText || rawText.trim().length < 4) {
    console.warn('[Visiting card] Engine: OCR. No readable text found.');
    throw new ImageNotClearError([
      'No readable text was found. Please take another photo with the card in focus.'
    ]);
  }

  onStatus?.({ step: 'map', label: 'Matching extracted text to form fields…', percent: 90 });
  const fields = normalizeExtractedFields(await ocrService.parseLeadDataFromText(rawText));
  onStatus?.({ step: 'done', label: 'OCR finished. Filling the form…', percent: 100 });
  console.info('[Visiting card] Engine used: OCR', {
    engine: 'OCR',
    source: 'ocr',
    fields
  });
  return {
    source: 'ocr',
    fields,
    rawText,
    isClearlyVisible: true,
    qualityIssues: []
  };
};

export const FIELD_LABELS: Array<{ key: keyof ExtractedLeadData; label: string }> = [
  { key: 'agencyName', label: 'Agency / Partner Name' },
  { key: 'contactName', label: 'Contact Name' },
  { key: 'pocDesignation', label: 'Designation' },
  { key: 'phone', label: 'Primary Mobile' },
  { key: 'alternateMobile', label: 'Alternate Mobile' },
  { key: 'email', label: 'Email' },
  { key: 'websiteLink', label: 'Website' },
  { key: 'address', label: 'Address' },
  { key: 'city', label: 'City' },
  { key: 'state', label: 'State' },
  { key: 'country', label: 'Country' },
  { key: 'remarks', label: 'Remarks' }
];
