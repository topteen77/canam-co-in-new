export function canPreviewDocument(fileType?: string, fileName?: string): boolean {
  const type = String(fileType || '').toLowerCase();
  const name = String(fileName || '').toLowerCase();
  if (type.startsWith('image/')) return true;
  if (/\.(png|jpe?g|gif|webp|bmp|svg)$/.test(name)) return true;
  if (type === 'application/pdf' || name.endsWith('.pdf')) return true;
  return false;
}

export function downloadStoredDocument(doc: {
  fileData?: string;
  url?: string;
  fileName?: string;
  fileType?: string;
} | null | undefined): void {
  const raw = String(doc?.fileData || doc?.url || '').trim();
  if (!raw || typeof document === 'undefined') return;

  const fileName = doc?.fileName || 'document';
  let href = raw;
  if (!/^(https?:|data:|blob:)/i.test(raw)) {
    const mime = doc?.fileType || 'application/octet-stream';
    href = `data:${mime};base64,${raw}`;
  }

  const link = document.createElement('a');
  link.href = href;
  link.download = fileName;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
}
