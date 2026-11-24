import React, { useState } from 'react';
import { canPreviewDocument, downloadStoredDocument } from '../utils/documentPreview';
import apiClient from '../services/apiClient';

interface SimpleDocUploadProps {
  leadId: string;
  documentType: 'companyRegistration' | 'panCard' | 'gstNumber' | 'mou';
  documentLabel: string;
  currentDocument?: any;
  onUploadComplete: (doc: any) => void;
  currentUser: string;
  disabled?: boolean;
}

export const SimpleDocUpload: React.FC<SimpleDocUploadProps> = ({
  leadId,
  documentType,
  documentLabel,
  currentDocument,
  onUploadComplete,
  currentUser,
  disabled = false
}) => {
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ src: string; name: string; type: string } | null>(null);

  const compressImage = (file: File, maxWidth: number = 1200, quality: number = 0.7): Promise<string> => {
    return new Promise((resolve, reject) => {
      if (!file.type.startsWith('image/')) {
        // For non-image files, convert to base64 directly
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsDataURL(file);
        return;
      }

      const img = new Image();
      const objectUrl = URL.createObjectURL(file);

      img.onload = () => {
        URL.revokeObjectURL(objectUrl); // Clean up memory
        
        // Calculate new dimensions
        let { width, height } = img;
        if (width > height) {
          if (width > maxWidth) {
            height = (height * maxWidth) / width;
            width = maxWidth;
          }
        } else {
          if (height > maxWidth) {
            width = (width * maxWidth) / height;
            height = maxWidth;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            reject(new Error('Canvas context not available'));
            return;
        }

        // Draw and compress
        ctx.drawImage(img, 0, 0, width, height);
        
        // 🟢 SAFE FIX: Wrap toDataURL in try/catch as it can fail on some browsers/images
        try {
            const compressedDataUrl = canvas.toDataURL(file.type, quality);
            resolve(compressedDataUrl);
        } catch (e) {
            reject(new Error('Image compression failed'));
        }
      };

      img.onerror = () => {
          URL.revokeObjectURL(objectUrl);
          reject(new Error('Failed to load image'));
      };
      
      img.src = objectUrl;
    });
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type - Extended list including Excel
    const allowedTypes = [
      'image/jpeg',
      'image/jpg', 
      'image/png',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ];
    
    // Also check file extension as fallback
    const allowedExtensions = ['.jpg', '.jpeg', '.png', '.pdf', '.doc', '.docx', '.xls', '.xlsx'];
    const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase();
    
    if (!allowedTypes.includes(file.type) && !allowedExtensions.includes(fileExtension)) {
      setError('Invalid file type. Please select a JPG, PNG, PDF, Word doc (.doc, .docx), or Excel (.xls, .xlsx) file.');
      return;
    }

    // Validate file size (5MB limit)
    const maxSize = 5 * 1024 * 1024; // 5MB
    if (file.size > maxSize) {
      setError(`File size too large (${(file.size / 1024 / 1024).toFixed(2)}MB). Maximum allowed: 5MB.`);
      return;
    }

    setError(null);
    setIsUploading(true);

    try {
      console.log('🚀 Starting simple upload...');
      
      // Compress and convert to base64
      const base64Data = await compressImage(file);
      console.log('✅ File converted to base64');

      const documentData = {
        leadId,
        documentType,
        fileName: file.name,
        fileType: file.type,
        fileData: base64Data,
        originalSize: file.size,
        compressedSize: base64Data.length,
        uploadedBy: currentUser,
        uploadedAt: new Date().toISOString()
      };

      const res = await apiClient.post('/documents/upload', documentData);
      const id = (res.data as any)?.id ?? (res.data as any)?.insertId ?? String(Date.now());
      const savedDoc = { id, ...documentData };
      console.log('✅ Document saved:', id);

      onUploadComplete(savedDoc);
      setIsUploading(false);
      
      // Clear the file input
      const fileInput = event.target;
      fileInput.value = '';
      
      console.log('✅ Upload completed successfully!');
      
    } catch (error: any) {
      console.error('❌ Upload error:', error);
      setError(`Upload failed: ${error.message}`);
      setIsUploading(false);
    }
  };

  const handlePreview = (dataUrl: string, fileName: string, fileType: string) => {
    if (!dataUrl) return;
    setPreview({ src: dataUrl, name: fileName || 'Document', type: fileType || '' });
  };

  return (
    <div className="space-y-2">
      <label className="block text-sm font-semibold text-slate-700">
        {documentLabel}
      </label>
      
      {currentDocument && (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <span className="text-green-700 text-lg">📄</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-green-800 truncate" title={currentDocument.fileName || currentDocument.url}>
                  {currentDocument.fileName || 'Document'}
                </p>
                <p className="text-xs text-green-600">
                  {currentDocument.uploadedAt && (
                    <>
                      Uploaded: {new Date(currentDocument.uploadedAt).toLocaleDateString()}
                      {currentDocument.originalSize && (
                        <span className="ml-2">
                          • {(currentDocument.originalSize / 1024 / 1024).toFixed(2)} MB
                        </span>
                      )}
                    </>
                  )}
                </p>
              </div>
            </div>
            <div className="flex gap-2 flex-shrink-0">
              {(currentDocument.fileData || currentDocument.url) && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      const dataUrl = currentDocument.fileData || currentDocument.url;
                      const fileName = currentDocument.fileName || 'Document';
                      const fileType = currentDocument.fileType || '';
                      handlePreview(dataUrl, fileName, fileType);
                    }}
                    className="inline-flex items-center justify-center h-7 min-w-[5.5rem] px-3 text-xs font-semibold leading-none rounded border box-border border-indigo-600 bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
                    title="Preview document"
                  >
                    Preview
                  </button>
                  {!canPreviewDocument(currentDocument.fileType, currentDocument.fileName) && (
                    <button
                      type="button"
                      onClick={() => downloadStoredDocument(currentDocument)}
                      className="inline-flex items-center justify-center h-7 min-w-[5.5rem] px-3 text-xs font-semibold leading-none rounded border box-border border-indigo-600 bg-white text-indigo-700 hover:bg-indigo-50 transition-colors"
                    >
                      Download
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
          {currentDocument.fileType && (
            <p className="text-xs text-slate-500 ml-1">
              File type: {currentDocument.fileType.split('/').pop()?.toUpperCase() || 'Unknown'}
            </p>
          )}
          <p className="text-xs text-slate-400 ml-1 italic">
            💡 Click "Choose File" again to replace this document
          </p>
        </div>
      )}

      <div className="relative">
        <input
          type="file"
          accept=".jpg,.jpeg,.png,.pdf,.doc,.docx,.xls,.xlsx"
          onChange={handleFileSelect}
          disabled={disabled || isUploading}
          className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 disabled:opacity-50 disabled:cursor-not-allowed"
        />
      </div>

      {isUploading && (
        <div className="flex items-center gap-2 text-sm text-slate-600">
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-indigo-600"></div>
          <span>Uploading...</span>
        </div>
      )}

      {error && (
        <div className="text-xs text-red-600 bg-red-50 p-3 rounded-lg border border-red-200">
          <span>⚠️ {error}</span>
        </div>
      )}

      {preview && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onContextMenu={(event) => event.preventDefault()}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl h-[80vh] flex flex-col overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <h3 className="font-semibold text-slate-900 truncate">{preview.name}</h3>
                <p className="text-xs text-slate-500">Preview only</p>
              </div>
              <button
                type="button"
                onClick={() => setPreview(null)}
                className="px-3 py-1.5 text-sm rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50"
              >
                Close
              </button>
            </div>
            {preview.type.startsWith('image/') ? (
              <div className="flex-1 overflow-auto bg-slate-50 flex items-center justify-center p-4">
                <img src={preview.src} alt={preview.name} draggable={false} className="max-w-full max-h-full object-contain" />
              </div>
            ) : preview.type === 'application/pdf' ? (
              <iframe
                title={preview.name}
                src={`${preview.src}#toolbar=0&navpanes=0&scrollbar=1`}
                className="flex-1 w-full bg-slate-100"
              />
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8 text-center text-slate-600">
                <p>This file type cannot be previewed in the browser.</p>
                <button
                  type="button"
                  onClick={() => downloadStoredDocument({
                    fileData: preview.src,
                    fileName: preview.name,
                    fileType: preview.type,
                  })}
                  className="inline-flex items-center justify-center h-8 min-w-[5.5rem] px-4 text-xs font-semibold leading-none rounded-lg border box-border border-indigo-600 bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
                >
                  Download
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="text-xs text-slate-500 space-y-1">
        <p>💡 <strong>Accepted formats:</strong> PDF, JPG, PNG, Word (.doc, .docx), Excel (.xls, .xlsx)</p>
        <p>📦 <strong>Maximum file size:</strong> 5MB</p>
        <p>🔒 Files are compressed and stored securely in the database</p>
      </div>
    </div>
  );
};