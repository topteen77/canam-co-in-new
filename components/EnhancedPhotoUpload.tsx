import React, { useState, useRef } from 'react';

const waitForPaint = () =>
  new Promise<void>((resolve) => {
    requestAnimationFrame(() => setTimeout(resolve, 30));
  });

const isSlowDevice = () => {
  const nav = navigator as Navigator & { deviceMemory?: number };
  const mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  const lowMemory = typeof nav.deviceMemory === 'number' && nav.deviceMemory <= 4;
  const fewCores = (navigator.hardwareConcurrency || 8) <= 4;
  return mobile || lowMemory || fewCores;
};

const blobToDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Could not read the prepared photo'));
    reader.readAsDataURL(blob);
  });

const compressImage = (file: File, quality: number): Promise<string> => {
  return new Promise(async (resolve, reject) => {
    const slow = isSlowDevice();
    const maxEdge = slow ? 1280 : 1600;
    const jpegQuality = slow ? Math.min(quality, 0.62) : quality;
    let bitmap: ImageBitmap | null = null;

    try {
      if (typeof createImageBitmap === 'function') {
        bitmap = await createImageBitmap(file);
      }
    } catch {
      bitmap = null;
    }

    const draw = (source: CanvasImageSource, sourceWidth: number, sourceHeight: number) => {
      const scale = Math.min(1, maxEdge / Math.max(sourceWidth, sourceHeight));
      const width = Math.max(1, Math.round(sourceWidth * scale));
      const height = Math.max(1, Math.round(sourceHeight * scale));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('This phone could not prepare the photo');
      ctx.drawImage(source, 0, 0, width, height);
      canvas.toBlob(async (blob) => {
        bitmap?.close();
        if (!blob) {
          reject(new Error('Could not prepare the photo'));
          return;
        }
        try {
          resolve(await blobToDataUrl(blob));
        } catch (error) {
          reject(error);
        }
      }, 'image/jpeg', jpegQuality);
    };

    if (bitmap) {
      try {
        draw(bitmap, bitmap.width, bitmap.height);
        return;
      } catch (error) {
        bitmap.close();
        reject(error);
        return;
      }
    }

    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      try {
        draw(img, img.naturalWidth || img.width, img.naturalHeight || img.height);
      } catch (error) {
        reject(error);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Could not open this photo'));
    };
    img.src = objectUrl;
  });
};

interface EnhancedPhotoUploadProps {
  onUploadComplete: (photos: string[], fileSize?: string) => void;
  onUploadError: (error: string) => void;
  disabled?: boolean;
  maxFileSize?: number; // in MB
  compressionQuality?: number; // 0.1 to 1.0
  showCameraInGallery?: boolean; // Show camera option in file picker
}

export const EnhancedPhotoUpload: React.FC<EnhancedPhotoUploadProps> = ({
  onUploadComplete,
  onUploadError,
  disabled = false,
  maxFileSize = 50, // 50MB default
  compressionQuality = 0.7, // 70% quality
  showCameraInGallery = false
}) => {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [compressionProgress, setCompressionProgress] = useState(0);
  const [statusText, setStatusText] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = event.target.files;
    const files = fileList ? Array.from(fileList) : [];
    console.log('📸 Files selected:', files.length);
    
    // Validate files
    const validFiles = files.filter((file: File) => {
      if (!file.type.startsWith('image/')) {
        onUploadError('Please select only image files');
        return false;
      }
      if (file.size > maxFileSize * 1024 * 1024) {
        onUploadError(`File size must be less than ${maxFileSize}MB. Large files will be compressed.`);
        return false;
      }
      return true;
    });
    
    if (validFiles.length === 0) {
      // Clear input if no valid files
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      return;
    }
    
    setSelectedFiles(validFiles);
    setUploading(true);
    setCompressionProgress(8);
    setStatusText(validFiles.length === 1 ? 'Photo received. Preparing it…' : `${validFiles.length} photos received. Preparing them…`);
    await waitForPaint();
    await uploadPhotos(validFiles);
    
    // Clear the input so the same file can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const uploadPhotos = async (filesToUpload?: File[]) => {
    // 🟢 SAFE FIX: Ensure we use the passed files or fallback to state
    const files = filesToUpload || selectedFiles;
    
    if (!files || files.length === 0) {
      onUploadError('Please select photos first');
      return;
    }

    setUploading(true);
    setStatusText('Making the photo smaller so this stays smooth…');
    await waitForPaint();

    try {
      const compressedPhotos: string[] = [];
      
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setStatusText(`Preparing photo ${i + 1} of ${files.length}…`);
        setCompressionProgress(Math.max(12, (i / files.length) * 100));
        await waitForPaint();
        
        try {
          const compressedDataUrl = await compressImage(file, compressionQuality);
          compressedPhotos.push(compressedDataUrl);
          setCompressionProgress(((i + 1) / files.length) * 100);
          setStatusText(`Photo ${i + 1} of ${files.length} is ready`);
          await waitForPaint();
        } catch (error) {
          console.error(`❌ Failed to compress photo ${i + 1}:`, error);
          // Fallback to original if compression fails
          const reader = new FileReader();
          const fallbackPromise = new Promise<string>((resolve, reject) => {
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = () => reject(new Error('Failed to read file'));
            reader.readAsDataURL(file);
          });
          
          try {
             const fallbackDataUrl = await fallbackPromise;
             compressedPhotos.push(fallbackDataUrl);
          } catch (readError) {
              console.error('Failed to read file even without compression', readError);
          }
        }
      }

      if (compressedPhotos.length === 0) {
        throw new Error('No photo could be prepared. Try again with a smaller picture.');
      }

      // Calculate total size after compression
      const totalSize = compressedPhotos.reduce((total, photo) => {
        // Base64 data URL size calculation (approximately)
        const base64Size = photo.length * 0.75; // Base64 is ~33% larger than binary
        return total + base64Size;
      }, 0);
      const totalSizeMB = (totalSize / (1024 * 1024)).toFixed(2);
      const fileSizeText = `${totalSizeMB}MB`;
      
      setStatusText('Photo ready');
      setCompressionProgress(100);
      await waitForPaint();
      onUploadComplete(compressedPhotos, fileSizeText);
      setSelectedFiles([]);
      setCompressionProgress(0);
      setStatusText('');
      
    } catch (error) {
      console.error('❌ Upload error:', error);
      onUploadError(`Upload failed: ${error}`);
    } finally {
      setUploading(false);
    }
  };

  const openFileDialog = () => {
    fileInputRef.current?.click();
  };

  const getFileSizeText = (file: File) => {
    const sizeInMB = (file.size / (1024 * 1024)).toFixed(1);
    return `${sizeInMB}MB`;
  };

  const getCompressionWarning = () => {
    const largeFiles = selectedFiles.filter(file => file.size > 5 * 1024 * 1024); // 5MB
    if (largeFiles.length > 0) {
      return (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-4">
          <div className="flex items-center gap-2 text-yellow-800">
            <span className="text-lg">⚠️</span>
            <div>
              <p className="font-semibold">Large photos detected!</p>
              <p className="text-sm">
                {largeFiles.length} photo(s) will be compressed to improve performance. 
                Original quality will be maintained as much as possible.
              </p>
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-4 p-4 border-2 border-green-400 rounded-lg bg-green-50">
      <h3 className="text-lg font-bold text-green-800">📸 Enhanced Photo Upload</h3>
      
      <div className="text-center">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*"
          capture={showCameraInGallery ? "environment" : undefined}
          onChange={handleFileSelect}
          className="hidden"
        />
        
        <button
          type="button"
          onClick={openFileDialog}
          disabled={disabled || uploading}
          className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 font-semibold flex items-center justify-center gap-2"
        >
          {uploading ? 'Please wait…' : '📸 Take or choose photo'}
        </button>
      </div>

      {getCompressionWarning()}

      {selectedFiles.length > 0 && (
        <div className="space-y-3">
          <h4 className="font-semibold text-green-800">Selected Photos:</h4>
          <div className="space-y-2">
            {selectedFiles.map((file, index) => (
              <div key={index} className="flex items-center justify-between p-2 bg-white rounded border">
                <div className="flex items-center gap-2">
                  <span className="text-sm">📷</span>
                  <span className="text-sm font-medium">{file.name}</span>
                  <span className="text-xs text-gray-500">({getFileSizeText(file)})</span>
                </div>
                {file.size > 5 * 1024 * 1024 && (
                  <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded">
                    Will compress
                  </span>
                )}
              </div>
            ))}
          </div>
          
          {uploading && (
            <div className="space-y-2 rounded-lg border border-green-200 bg-white p-3" role="status" aria-live="polite">
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="font-medium text-green-900">{statusText || 'Preparing your photo…'}</span>
                <span className="tabular-nums text-green-800">{Math.round(compressionProgress)}%</span>
              </div>
              <div className="h-2.5 w-full overflow-hidden rounded-full bg-green-100">
                <div
                  className="h-2.5 rounded-full bg-green-600 transition-all duration-300"
                  style={{ width: `${Math.max(compressionProgress, 8)}%` }}
                />
              </div>
              <p className="text-xs text-slate-600">Keep this screen open. A phone photo can take a few seconds.</p>
            </div>
          )}
          
          <div className="flex gap-2">
            {/* Note: The main upload logic is now automatic in handleFileSelect.
                This manual button is only needed if automatic upload failed or was cancelled.
                We can hide it if we want fully automatic behavior, but it's good to keep as a fallback. */}
            <button
              type="button"
              onClick={() => uploadPhotos()}
              disabled={disabled || uploading}
              className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 font-semibold"
            >
              {uploading ? 'Processing...' : '📤 Retry Upload'}
            </button>
            <button
              type="button"
              onClick={() => setSelectedFiles([])}
              disabled={uploading}
              className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 disabled:opacity-50"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      <div className="text-xs text-gray-600 bg-white p-2 rounded border">
        <p><strong>📋 Upload Guidelines:</strong></p>
        <ul className="list-disc list-inside space-y-1 mt-1">
          <li>Maximum file size: {maxFileSize}MB per photo</li>
          <li>Large photos will be automatically compressed</li>
          <li>Compression maintains quality while reducing file size</li>
          <li>Multiple photos supported</li>
        </ul>
      </div>
    </div>
  );
};