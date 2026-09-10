export type ImageQualityResult = {
  isClearlyVisible: boolean;
  issues: string[];
};

const MIN_DIMENSION = 180;
const DARK_THRESHOLD = 28;
const BRIGHT_THRESHOLD = 248;
const BLUR_VARIANCE_THRESHOLD = 45;

const loadImage = (file: File): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read the uploaded image. Please try another photo.'));
    };
    img.src = url;
  });

const laplacianVariance = (gray: Uint8ClampedArray, width: number, height: number): number => {
  const values: number[] = [];
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const center = gray[i];
      const lap =
        4 * center -
        gray[i - 1] -
        gray[i + 1] -
        gray[i - width] -
        gray[i + width];
      values.push(lap);
    }
  }
  if (!values.length) return 0;
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
  return variance;
};

/** Fast client-side check: too small, too dark/bright, or badly blurred. */
export const assessImageQuality = async (file: File): Promise<ImageQualityResult> => {
  const issues: string[] = [];
  const img = await loadImage(file);

  if (img.width < MIN_DIMENSION || img.height < MIN_DIMENSION) {
    issues.push('The image is too small or cropped. Please take a closer, clearer photo.');
  }

  const maxSide = 480;
  const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
  const width = Math.max(2, Math.round(img.width * scale));
  const height = Math.max(2, Math.round(img.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    return { isClearlyVisible: issues.length === 0, issues };
  }

  ctx.drawImage(img, 0, 0, width, height);
  const { data } = ctx.getImageData(0, 0, width, height);
  const gray = new Uint8ClampedArray(width * height);
  let brightnessSum = 0;

  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    const value = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
    gray[p] = value;
    brightnessSum += value;
  }

  const avgBrightness = brightnessSum / gray.length;
  if (avgBrightness < DARK_THRESHOLD) {
    issues.push('The image is too dark. Please retake it with better lighting.');
  } else if (avgBrightness > BRIGHT_THRESHOLD) {
    issues.push('The image is overexposed. Please retake it so the text is readable.');
  }

  const blurScore = laplacianVariance(gray, width, height);
  if (blurScore < BLUR_VARIANCE_THRESHOLD) {
    issues.push('The image looks blurry. Please hold the camera steady and tap to focus, then try again.');
  }

  return {
    isClearlyVisible: issues.length === 0,
    issues
  };
};

export const fileToBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(new Error('Failed to read image file'));
    reader.readAsDataURL(file);
  });

/** Downscale large photos so LLM vision stays fast and reliable. */
export const prepareImageForVision = async (
  file: File,
  maxSide = 1600
): Promise<{ base64: string; mimeType: string }> => {
  const img = await loadImage(file);
  const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
  const width = Math.round(img.width * scale);
  const height = Math.round(img.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return { base64: await fileToBase64(file), mimeType: file.type || 'image/jpeg' };
  }
  ctx.drawImage(img, 0, 0, width, height);
  const mimeType = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
  const dataUrl = canvas.toDataURL(mimeType, 0.88);
  return { base64: dataUrl.split(',')[1] || '', mimeType };
};
