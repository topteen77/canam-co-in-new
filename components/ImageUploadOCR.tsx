import React, { useEffect, useRef, useState } from 'react';
import type { ExtractedLeadData } from '../services/ocrService';
import {
  extractVisitingCard,
  FIELD_LABELS,
  ImageNotClearError,
  type ExtractionSource,
  type ProcessUpdate
} from '../services/visitingCardService';
import { isLLMConfigured } from '../services/geminiService';
import { useExtractAssign } from './ExtractAssign';
import { CardScanCapture } from './CardScanCapture';
import { ImageAdjustEditor } from './ImageAdjustEditor';

interface ImageUploadOCRProps {
  onExtractComplete: (data: ExtractedLeadData) => void;
  onError: (error: string) => void;
}

const PROCESS_STEPS: Array<{ id: ProcessUpdate['step']; label: string }> = [
  { id: 'open', label: 'Opening image' },
  { id: 'quality', label: 'Improving scan quality' },
  { id: 'ai', label: 'Reading with AI' },
  { id: 'ocr', label: 'Reading with OCR' },
  { id: 'map', label: 'Matching fields' },
  { id: 'done', label: 'Filling form' }
];

const stepIndex = (step: ProcessUpdate['step']) => PROCESS_STEPS.findIndex((item) => item.id === step);

export const ImageUploadOCR: React.FC<ImageUploadOCRProps> = ({ onExtractComplete, onError }) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [extractedText, setExtractedText] = useState('');
  const [extractedFields, setExtractedFields] = useState<ExtractedLeadData | null>(null);
  const [extractionSource, setExtractionSource] = useState<ExtractionSource | null>(null);
  const [qualityWarning, setQualityWarning] = useState<string[]>([]);
  const [processingStatus, setProcessingStatus] = useState('');
  const [processingPercent, setProcessingPercent] = useState(0);
  const [activeStep, setActiveStep] = useState<ProcessUpdate['step'] | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const lastSourceRef = useRef<File | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [showScanner, setShowScanner] = useState(false);
  const [editorFile, setEditorFile] = useState<File | null>(null);
  const llmReady = isLLMConfigured();
  const assignCtx = useExtractAssign();

  const openScanner = () => {
    if (typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia) {
      setShowScanner(true);
      return;
    }
    cameraInputRef.current?.click();
  };

  const openEditor = (file: File) => {
    const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (file.type && !validTypes.includes(file.type)) {
      onError('Please select a valid image file (JPG, PNG, or WebP)');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      onError('Image size should be less than 10MB');
      return;
    }
    lastSourceRef.current = file;
    onError('');
    setEditorFile(file);
  };

  const resetExtraction = () => {
    setExtractedText('');
    setExtractedFields(null);
    setExtractionSource(null);
    setQualityWarning([]);
    setActiveStep(null);
    setProcessingPercent(0);
    assignCtx?.setExtraction(null);
  };

  const handleProcessUpdate = (update: ProcessUpdate) => {
    setActiveStep(update.step);
    setProcessingStatus(update.label);
    if (typeof update.percent === 'number') setProcessingPercent(Math.max(0, Math.min(100, update.percent)));
  };

  const cancelProcessing = () => {
    abortRef.current?.abort();
  };

  useEffect(() => () => {
    abortRef.current?.abort();
  }, []);

  const processFile = async (file: File) => {
    const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (file.type && !validTypes.includes(file.type)) {
      onError('Please select a valid image file (JPG, PNG, or WebP)');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      onError('Image size should be less than 10MB');
      return;
    }

    resetExtraction();
    onError('');
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setIsProcessing(true);
    handleProcessUpdate({ step: 'open', label: 'Opening image…', percent: 5 });

    try {
      const preview = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(String(e.target?.result || ''));
        reader.onerror = () => reject(new Error('Failed to read image file'));
        reader.readAsDataURL(file);
      });
      setUploadedImage(preview);

      const result = await extractVisitingCard(file, handleProcessUpdate, {
        skipAutoRotate: true,
        signal: controller.signal
      });
      if (result.enhancedPreview) setUploadedImage(result.enhancedPreview);
      setExtractedText(result.rawText);
      setExtractedFields(result.fields);
      setExtractionSource(result.source);
      assignCtx?.setExtraction({
        text: result.rawText,
        fields: result.fields,
        source: result.source
      });
      const engineLabel = result.source === 'llm' ? 'LLM' : 'OCR';
      console.info(`[Visiting card] Form filled using ${engineLabel}`, {
        engine: engineLabel,
        source: result.source,
        fields: result.fields
      });
      handleProcessUpdate({
        step: 'done',
        label: result.source === 'llm' ? 'Done — form filled from AI reading.' : 'Done — form filled from OCR text.',
        percent: 100
      });
      onExtractComplete(result.fields);
    } catch (error) {
      console.error('Visiting card extraction error:', error);
      if (error instanceof Error && (error.name === 'OcrCancelledError' || error.name === 'AbortError')) {
        setProcessingStatus('Cancelled.');
        setProcessingPercent(0);
        setActiveStep(null);
        return;
      }
      if (error instanceof ImageNotClearError) {
        setQualityWarning(error.qualityIssues);
        setProcessingStatus('Stopped — image is not clearly visible.');
        setProcessingPercent(0);
        return;
      }
      const errorMessage = error instanceof Error ? error.message : 'Failed to extract information from image';
      setProcessingStatus(`Error: ${errorMessage}`);
      onError(errorMessage);
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setIsProcessing(false);
    }
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) openEditor(file);
    event.target.value = '';
  };

  const handleRemoveImage = () => {
    cancelProcessing();
    setUploadedImage(null);
    resetExtraction();
    setProcessingStatus('');
    onError('');
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (cameraInputRef.current) cameraInputRef.current.value = '';
  };

  const filledFields = FIELD_LABELS.filter((field) => extractedFields?.[field.key]);
  const currentStepNumber = activeStep ? stepIndex(activeStep) : -1;

  return (
    <div className="space-y-4">
      <div className="bg-gradient-to-r from-purple-50 to-pink-50 p-4 rounded-lg border-2 border-purple-200">
        <h3 className="text-lg font-bold text-slate-800 mb-2 flex items-center gap-2">
          📸 Upload Visiting Card or Screenshot
        </h3>
        <p className="text-sm text-slate-600 mb-3">
          Upload a visiting card or tap Take photo. You can crop extra area, rotate, and adjust brightness before the card is read.
          {llmReady
            ? ' After you confirm, lighting and shine are reduced in color, then AI fills matching fields. OCR is used if AI is unavailable.'
            : ' After you confirm, lighting and shine are reduced in color, then OCR fills matching fields. Add a Gemini API key to enable AI reading.'}
        </p>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={handleFileSelect}
          className="hidden"
          disabled={isProcessing}
        />
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          capture="environment"
          onChange={handleFileSelect}
          className="hidden"
          disabled={isProcessing}
        />

        <div className="flex flex-col sm:flex-row gap-3">
          <button
            type="button"
            disabled={isProcessing}
            onClick={() => fileInputRef.current?.click()}
            className={`
              flex-1 px-4 py-3 rounded-lg border-2 border-dashed text-center transition-all
              ${isProcessing
                ? 'bg-gray-100 border-gray-300 cursor-not-allowed'
                : 'bg-white border-purple-300 hover:border-purple-500 hover:bg-purple-50'}
            `}
          >
            <div className="flex flex-col items-center gap-2">
              <span className="text-2xl">📷</span>
              <span className="text-sm font-semibold text-slate-700">
                {uploadedImage ? 'Upload a different image' : 'Click to Upload Image'}
              </span>
              <span className="text-xs text-slate-500">JPG, PNG, or WebP (max 10MB)</span>
            </div>
          </button>

          <button
            type="button"
            disabled={isProcessing}
            onClick={openScanner}
            className="px-4 py-3 bg-white text-slate-700 rounded-lg hover:bg-purple-50 font-medium text-sm border-2 border-purple-300 min-h-[44px]"
          >
            📸 Take photo
          </button>

          {uploadedImage && (
            <button
              type="button"
              onClick={handleRemoveImage}
              className="px-4 py-3 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 font-medium text-sm border-2 border-red-300"
            >
              🗑️ Remove
            </button>
          )}
        </div>

        {(isProcessing || processingStatus) && (
          <div className="mt-4 bg-white border border-purple-200 rounded-lg p-3">
            <div className="flex items-center justify-between gap-2 mb-2">
              <p className="text-sm font-semibold text-purple-800">
                {isProcessing ? 'Processing image…' : processingStatus}
              </p>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-purple-700">{processingPercent}%</span>
                {isProcessing && (
                  <button
                    type="button"
                    onClick={cancelProcessing}
                    className="px-2.5 py-1 text-xs font-semibold bg-white text-red-700 border border-red-300 rounded-md min-h-[32px]"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </div>
            <div className="h-2 bg-purple-100 rounded-full overflow-hidden mb-3">
              <div
                className="h-full bg-purple-600 transition-all duration-300"
                style={{ width: `${processingPercent}%` }}
              />
            </div>
            {isProcessing && processingStatus && (
              <p className="text-xs text-purple-700 mb-2">{processingStatus}</p>
            )}
            <ol className="space-y-1">
              {PROCESS_STEPS.filter((step) => {
                if (step.id === 'ai' && !llmReady && activeStep !== 'ai') return false;
                if (step.id === 'ocr' && llmReady && activeStep === 'ai') return false;
                return true;
              }).map((step) => {
                const index = stepIndex(step.id);
                const done = currentStepNumber > index || (!isProcessing && activeStep === 'done' && index <= currentStepNumber);
                const current = isProcessing && step.id === activeStep;
                return (
                  <li key={step.id} className={`text-xs flex items-center gap-2 ${current ? 'text-purple-800 font-semibold' : done ? 'text-emerald-700' : 'text-slate-500'}`}>
                    <span>{current ? '⏳' : done ? '✅' : '○'}</span>
                    <span>{step.label}{current && processingStatus.includes('%') ? ` — ${processingStatus}` : ''}</span>
                  </li>
                );
              })}
            </ol>
          </div>
        )}

        {qualityWarning.length > 0 && (
          <div className="mt-4 bg-amber-50 border border-amber-300 rounded-lg p-3">
            <p className="text-sm font-semibold text-amber-900">This image is not clearly visible. Please click it again.</p>
            <ul className="mt-1 text-xs text-amber-800 list-disc pl-5 space-y-0.5">
              {qualityWarning.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={openScanner}
                className="px-3 py-2 text-sm font-semibold bg-amber-600 text-white rounded-lg hover:bg-amber-700"
              >
                Take another photo
              </button>
              {lastSourceRef.current && (
                <button
                  type="button"
                  onClick={() => lastSourceRef.current && openEditor(lastSourceRef.current)}
                  className="px-3 py-2 text-sm font-semibold bg-white text-amber-900 rounded-lg border border-amber-400"
                >
                  Crop / adjust this photo
                </button>
              )}
            </div>
          </div>
        )}

        {uploadedImage && (
          <div className="mt-4">
            <div className="bg-white p-3 rounded-lg border border-purple-200">
              <h4 className="text-sm font-semibold text-slate-700 mb-2">Scan preview:</h4>
              <img
                src={uploadedImage}
                alt="Uploaded visiting card"
                className="max-w-full h-auto max-h-48 rounded border border-slate-200"
              />
              {lastSourceRef.current && !isProcessing && (
                <button
                  type="button"
                  onClick={() => lastSourceRef.current && openEditor(lastSourceRef.current)}
                  className="mt-2 px-3 py-2 text-sm font-semibold bg-purple-100 text-purple-800 rounded-lg hover:bg-purple-200"
                >
                  Crop / rotate / adjust
                </button>
              )}
            </div>
          </div>
        )}

        {filledFields.length > 0 && extractedFields && (
          <div className="mt-4 bg-emerald-50 p-3 rounded-lg border border-emerald-200">
            <h4 className="text-sm font-semibold text-emerald-800 mb-2">
              {extractionSource === 'llm' ? 'AI filled these fields:' : 'OCR filled these fields:'}
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {filledFields.map((field) => (
                <button
                  key={field.key}
                  type="button"
                  draggable
                  onDragStart={(event) => {
                    const value = String(extractedFields[field.key] || '');
                    event.dataTransfer.setData('text/plain', value);
                    event.dataTransfer.effectAllowed = 'copy';
                    assignCtx?.setActiveSnippet(value);
                  }}
                  onClick={() => assignCtx?.setActiveSnippet(String(extractedFields[field.key] || ''))}
                  className="text-left bg-white rounded border border-emerald-100 px-2 py-1.5"
                >
                  <div className="text-[10px] uppercase tracking-wide text-emerald-600">{field.label}</div>
                  <div className="text-sm text-slate-800 break-words">{extractedFields[field.key]}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {extractedText && (
          <p className="mt-3 text-xs text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-2">
            Extracted text is pinned at the bottom as a tool. Scroll the form and drag or tap chips into fields.
          </p>
        )}
      </div>
      {showScanner && (
        <CardScanCapture
          onCapture={(file) => {
            setShowScanner(false);
            openEditor(file);
          }}
          onClose={() => setShowScanner(false)}
        />
      )}
      {editorFile && (
        <ImageAdjustEditor
          key={`${editorFile.name}-${editorFile.size}-${editorFile.lastModified}`}
          file={editorFile}
          onConfirm={(file) => {
            lastSourceRef.current = file;
            setEditorFile(null);
            void processFile(file);
          }}
          onCancel={() => setEditorFile(null)}
        />
      )}
    </div>
  );
};
