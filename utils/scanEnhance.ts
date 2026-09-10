/** Scanner-style color enhance: flatten lighting and reduce glossy reflections. No binary B&W. */

export type ScanEnhanceResult = {
  file: File;
  dataUrl: string;
  glareRatio: number;
  rotated: boolean;
};

const loadImage = (source: File | Blob | HTMLImageElement | HTMLVideoElement): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    if (source instanceof HTMLImageElement) {
      if (source.complete && source.naturalWidth) {
        resolve(source);
        return;
      }
    }
    const img = new Image();
    const url = source instanceof HTMLImageElement ? source.src : URL.createObjectURL(source as Blob);
    img.onload = () => {
      if (!(source instanceof HTMLImageElement)) URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      if (!(source instanceof HTMLImageElement)) URL.revokeObjectURL(url);
      reject(new Error('Could not read the image'));
    };
    img.src = url;
  });

const canvasToFile = (canvas: HTMLCanvasElement, name = 'visiting-card.jpg'): Promise<{ file: File; dataUrl: string }> =>
  new Promise((resolve, reject) => {
    const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('Failed to encode image'));
          return;
        }
        resolve({ file: new File([blob], name, { type: 'image/jpeg' }), dataUrl });
      },
      'image/jpeg',
      0.9
    );
  });

const drawToFit = (source: CanvasImageSource, maxSide: number): HTMLCanvasElement => {
  const sw = (source as HTMLVideoElement).videoWidth || (source as HTMLImageElement).naturalWidth || (source as HTMLCanvasElement).width;
  const sh = (source as HTMLVideoElement).videoHeight || (source as HTMLImageElement).naturalHeight || (source as HTMLCanvasElement).height;
  const scale = Math.min(1, maxSide / Math.max(sw, sh));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(2, Math.round(sw * scale));
  canvas.height = Math.max(2, Math.round(sh * scale));
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas context not available');
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
};

const rotateCanvas90 = (src: HTMLCanvasElement): HTMLCanvasElement => {
  const out = document.createElement('canvas');
  out.width = src.height;
  out.height = src.width;
  const ctx = out.getContext('2d');
  if (!ctx) return src;
  ctx.translate(out.width, 0);
  ctx.rotate(Math.PI / 2);
  ctx.drawImage(src, 0, 0);
  return out;
};

const boxBlurChannel = (src: Float32Array, width: number, height: number, radius: number): Float32Array => {
  const tmp = new Float32Array(src.length);
  const out = new Float32Array(src.length);
  const r = Math.max(1, radius);

  for (let y = 0; y < height; y++) {
    let sum = 0;
    let count = 0;
    for (let x = -r; x < width; x++) {
      if (x + r < width) {
        sum += src[y * width + (x + r)];
        count++;
      }
      if (x - r - 1 >= 0) {
        sum -= src[y * width + (x - r - 1)];
        count--;
      }
      if (x >= 0) tmp[y * width + x] = sum / Math.max(1, count);
    }
  }

  for (let x = 0; x < width; x++) {
    let sum = 0;
    let count = 0;
    for (let y = -r; y < height; y++) {
      if (y + r < height) {
        sum += tmp[(y + r) * width + x];
        count++;
      }
      if (y - r - 1 >= 0) {
        sum -= tmp[(y - r - 1) * width + x];
        count--;
      }
      if (y >= 0) out[y * width + x] = sum / Math.max(1, count);
    }
  }
  return out;
};

const enhanceColorData = (imageData: ImageData): { glareRatio: number } => {
  const { data, width, height } = imageData;
  const n = width * height;
  const lum = new Float32Array(n);
  const sat = new Float32Array(n);
  const glare = new Uint8Array(n);

  for (let p = 0, i = 0; p < n; p++, i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    lum[p] = 0.299 * r + 0.587 * g + 0.114 * b;
    sat[p] = max === 0 ? 0 : (max - min) / max;
    glare[p] = lum[p] >= 232 && sat[p] <= 0.14 ? 1 : 0;
  }

  let glareCount = 0;
  for (let p = 0; p < n; p++) if (glare[p]) glareCount++;
  const glareRatio = glareCount / n;

  const radius = Math.max(2, Math.round(Math.min(width, height) * 0.03));
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = y * width + x;
      if (!glare[p]) continue;
      let rSum = 0;
      let gSum = 0;
      let bSum = 0;
      let count = 0;
      for (let dy = -radius; dy <= radius; dy += 2) {
        const yy = y + dy;
        if (yy < 0 || yy >= height) continue;
        for (let dx = -radius; dx <= radius; dx += 2) {
          const xx = x + dx;
          if (xx < 0 || xx >= width) continue;
          const q = yy * width + xx;
          if (glare[q]) continue;
          const qi = q * 4;
          rSum += data[qi];
          gSum += data[qi + 1];
          bSum += data[qi + 2];
          count++;
        }
      }
      const i = p * 4;
      if (count > 0) {
        data[i] = Math.round(rSum / count);
        data[i + 1] = Math.round(gSum / count);
        data[i + 2] = Math.round(bSum / count);
        lum[p] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      } else {
        data[i] = Math.min(210, data[i]);
        data[i + 1] = Math.min(210, data[i + 1]);
        data[i + 2] = Math.min(210, data[i + 2]);
      }
    }
  }

  const bg = boxBlurChannel(lum, width, height, Math.max(8, Math.round(Math.min(width, height) / 18)));
  const copy = new Uint8ClampedArray(data);

  for (let p = 0, i = 0; p < n; p++, i += 4) {
    const L = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    const denom = Math.max(18, bg[p]);
    let newL = (L / denom) * 168;
    newL = Math.max(0, Math.min(255, (newL - 128) * 1.18 + 128));
    const scale = L < 1 ? 1 : newL / L;
    data[i] = Math.max(0, Math.min(255, Math.round(data[i] * scale)));
    data[i + 1] = Math.max(0, Math.min(255, Math.round(data[i + 1] * scale)));
    data[i + 2] = Math.max(0, Math.min(255, Math.round(data[i + 2] * scale)));
  }

  const amount = 0.35;
  for (let p = 0, i = 0; p < n; p++, i += 4) {
    data[i] = Math.max(0, Math.min(255, Math.round(data[i] + (data[i] - copy[i]) * amount)));
    data[i + 1] = Math.max(0, Math.min(255, Math.round(data[i + 1] + (data[i + 1] - copy[i + 1]) * amount)));
    data[i + 2] = Math.max(0, Math.min(255, Math.round(data[i + 2] + (data[i + 2] - copy[i + 2]) * amount)));
  }

  return { glareRatio };
};

export const enhanceScanImage = async (
  file: File,
  options?: { skipAutoRotate?: boolean }
): Promise<ScanEnhanceResult> => {
  const img = await loadImage(file);
  let canvas = drawToFit(img, 1600);
  let rotated = false;
  if (!options?.skipAutoRotate && canvas.height > canvas.width * 1.12) {
    canvas = rotateCanvas90(canvas);
    rotated = true;
  }
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas context not available');
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const { glareRatio } = enhanceColorData(imageData);
  ctx.putImageData(imageData, 0, 0);
  const { file: outFile, dataUrl } = await canvasToFile(canvas, file.name.replace(/\.[^.]+$/, '') + '-scan.jpg');
  console.info('[Visiting card] Scan enhance complete', { glareRatio: Number(glareRatio.toFixed(3)), rotated });
  return { file: outFile, dataUrl, glareRatio, rotated };
};

export const cropVideoToCardFrame = async (
  video: HTMLVideoElement,
  frameEl: HTMLElement
): Promise<File> => {
  const videoRect = video.getBoundingClientRect();
  const frameRect = frameEl.getBoundingClientRect();
  const videoAspect = video.videoWidth / video.videoHeight;
  const viewAspect = videoRect.width / videoRect.height;

  let renderedW: number;
  let renderedH: number;
  let offsetX = 0;
  let offsetY = 0;
  if (videoAspect > viewAspect) {
    renderedH = videoRect.height;
    renderedW = renderedH * videoAspect;
    offsetX = (renderedW - videoRect.width) / 2;
  } else {
    renderedW = videoRect.width;
    renderedH = renderedW / videoAspect;
    offsetY = (renderedH - videoRect.height) / 2;
  }

  const scaleX = video.videoWidth / renderedW;
  const scaleY = video.videoHeight / renderedH;
  const sx = Math.max(0, (frameRect.left - videoRect.left + offsetX) * scaleX);
  const sy = Math.max(0, (frameRect.top - videoRect.top + offsetY) * scaleY);
  const sw = Math.min(video.videoWidth - sx, frameRect.width * scaleX);
  const sh = Math.min(video.videoHeight - sy, frameRect.height * scaleY);

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(2, Math.round(sw));
  canvas.height = Math.max(2, Math.round(sh));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas context not available');
  ctx.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  const { file } = await canvasToFile(canvas, 'visiting-card-capture.jpg');
  return file;
};

export const glareMessage = (glareRatio: number): string | null => {
  if (glareRatio >= 0.22) {
    return 'Shine is covering too much of the card. Tilt the card slightly, turn off flash, and tap again.';
  }
  if (glareRatio >= 0.12) {
    return 'Some reflection was reduced. If names look wrong, tilt the card and take another photo.';
  }
  return null;
};
