/** Manual crop / rotate / lighting for visiting-card photos, before scan enhance. */

export const CARD_ASPECT = 1.586;

export type CropRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type ImageAdjustments = {
  rotation: number;
  straighten: number;
  brightness: number;
  contrast: number;
  saturate: number;
  sharpen: number;
  crop: CropRect;
};

export const DEFAULT_ADJUSTMENTS: ImageAdjustments = {
  rotation: 0,
  straighten: 0,
  brightness: 1,
  contrast: 1,
  saturate: 1,
  sharpen: 0.15,
  crop: { x: 0.03, y: 0.03, width: 0.94, height: 0.94 }
};

export type LoadedImage = {
  source: CanvasImageSource;
  width: number;
  height: number;
  close: () => void;
};

export const loadAdjustImage = async (file: File): Promise<LoadedImage> => {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions);
    return {
      source: bitmap,
      width: bitmap.width,
      height: bitmap.height,
      close: () => bitmap.close()
    };
  } catch {
    const url = URL.createObjectURL(file);
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Could not open this image. Try another photo.'));
      el.src = url;
    });
    return {
      source: img,
      width: img.naturalWidth,
      height: img.naturalHeight,
      close: () => URL.revokeObjectURL(url)
    };
  }
};

export const rotatedBounds = (width: number, height: number, degrees: number): { width: number; height: number } => {
  const rad = (degrees * Math.PI) / 180;
  const cos = Math.abs(Math.cos(rad));
  const sin = Math.abs(Math.sin(rad));
  return {
    width: Math.max(2, Math.round(width * cos + height * sin)),
    height: Math.max(2, Math.round(width * sin + height * cos))
  };
};

export const clampCrop = (crop: CropRect, minSize = 0.08): CropRect => {
  const width = Math.max(minSize, Math.min(1, crop.width));
  const height = Math.max(minSize, Math.min(1, crop.height));
  return {
    x: Math.max(0, Math.min(1 - width, crop.x)),
    y: Math.max(0, Math.min(1 - height, crop.y)),
    width,
    height
  };
};

/** Largest centered crop with visiting-card proportions. */
export const cardRatioCrop = (imageAspect: number, inset = 0.02): CropRect => {
  const target = CARD_ASPECT;
  const cropRatio = target / Math.max(0.01, imageAspect);
  let width: number;
  let height: number;
  if (cropRatio >= 1) {
    width = 1 - inset * 2;
    height = width / cropRatio;
    if (height > 1 - inset * 2) {
      height = 1 - inset * 2;
      width = height * cropRatio;
    }
  } else {
    height = 1 - inset * 2;
    width = height * cropRatio;
    if (width > 1 - inset * 2) {
      width = 1 - inset * 2;
      height = width / cropRatio;
    }
  }
  return clampCrop({
    x: (1 - width) / 2,
    y: (1 - height) / 2,
    width,
    height
  });
};

const cssFilter = (adj: ImageAdjustments): string => {
  const contrast = adj.contrast * (1 + adj.sharpen * 0.22);
  return `brightness(${adj.brightness}) contrast(${contrast}) saturate(${adj.saturate})`;
};

export const drawAdjustedImage = (
  ctx: CanvasRenderingContext2D,
  loaded: LoadedImage,
  adj: ImageAdjustments,
  destWidth: number,
  destHeight: number
): void => {
  const degrees = adj.rotation + adj.straighten;
  ctx.save();
  ctx.fillStyle = '#111';
  ctx.fillRect(0, 0, destWidth, destHeight);
  ctx.filter = cssFilter(adj);
  ctx.translate(destWidth / 2, destHeight / 2);
  ctx.rotate((degrees * Math.PI) / 180);
  ctx.drawImage(loaded.source, -loaded.width / 2, -loaded.height / 2, loaded.width, loaded.height);
  ctx.restore();
};

const sharpenImageData = (imageData: ImageData, amount: number): void => {
  if (amount <= 0.01) return;
  const { data, width, height } = imageData;
  const copy = new Uint8ClampedArray(data);
  const mix = Math.min(1, amount);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = (y * width + x) * 4;
      for (let c = 0; c < 3; c++) {
        const sharp =
          -copy[i - width * 4 + c] -
          copy[i - 4 + c] +
          5 * copy[i + c] -
          copy[i + 4 + c] -
          copy[i + width * 4 + c];
        data[i + c] = Math.max(0, Math.min(255, Math.round(copy[i + c] * (1 - mix) + sharp * mix)));
      }
    }
  }
};

const canvasToFile = (canvas: HTMLCanvasElement, name: string): Promise<{ file: File; dataUrl: string }> =>
  new Promise((resolve, reject) => {
    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('Could not save the adjusted image'));
          return;
        }
        resolve({ file: new File([blob], name, { type: 'image/jpeg' }), dataUrl });
      },
      'image/jpeg',
      0.92
    );
  });

export const renderAdjustedPreview = (
  canvas: HTMLCanvasElement,
  loaded: LoadedImage,
  adj: ImageAdjustments,
  maxSide = 1100
): { width: number; height: number } => {
  const degrees = adj.rotation + adj.straighten;
  const bounds = rotatedBounds(loaded.width, loaded.height, degrees);
  const scale = Math.min(1, maxSide / Math.max(bounds.width, bounds.height));
  canvas.width = Math.max(2, Math.round(bounds.width * scale));
  canvas.height = Math.max(2, Math.round(bounds.height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas context not available');
  const src: LoadedImage = {
    ...loaded,
    width: Math.max(2, Math.round(loaded.width * scale)),
    height: Math.max(2, Math.round(loaded.height * scale))
  };
  drawAdjustedImage(ctx, src, adj, canvas.width, canvas.height);
  return { width: canvas.width, height: canvas.height };
};

export const exportAdjustedImage = async (
  loaded: LoadedImage,
  adj: ImageAdjustments,
  name = 'visiting-card-adjusted.jpg',
  maxSide = 2000
): Promise<{ file: File; dataUrl: string }> => {
  const degrees = adj.rotation + adj.straighten;
  const bounds = rotatedBounds(loaded.width, loaded.height, degrees);
  const scale = Math.min(1, maxSide / Math.max(bounds.width, bounds.height, loaded.width, loaded.height));
  const srcW = Math.max(2, Math.round(loaded.width * scale));
  const srcH = Math.max(2, Math.round(loaded.height * scale));
  const full = document.createElement('canvas');
  full.width = Math.max(2, Math.round(bounds.width * scale));
  full.height = Math.max(2, Math.round(bounds.height * scale));
  const ctx = full.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas context not available');
  drawAdjustedImage(ctx, { ...loaded, width: srcW, height: srcH }, adj, full.width, full.height);

  const crop = clampCrop(adj.crop);
  const sx = Math.round(crop.x * full.width);
  const sy = Math.round(crop.y * full.height);
  const sw = Math.max(2, Math.round(crop.width * full.width));
  const sh = Math.max(2, Math.round(crop.height * full.height));
  const out = document.createElement('canvas');
  out.width = Math.min(sw, full.width - sx);
  out.height = Math.min(sh, full.height - sy);
  const octx = out.getContext('2d', { willReadFrequently: true });
  if (!octx) throw new Error('Canvas context not available');
  octx.drawImage(full, sx, sy, out.width, out.height, 0, 0, out.width, out.height);
  if (adj.sharpen > 0.05) {
    const imageData = octx.getImageData(0, 0, out.width, out.height);
    sharpenImageData(imageData, adj.sharpen * 0.45);
    octx.putImageData(imageData, 0, 0);
  }
  return canvasToFile(out, name);
};
