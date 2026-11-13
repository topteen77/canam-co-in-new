const PREVIEW_ONLY_ROLES = new Set(['user', 'admin', 'superadmin', 'subadmin']);

export function normalizeRole(role) {
  return String(role || '').toLowerCase().replace(/[\s_-]/g, '');
}

/** User and admin roles may preview uploaded documents, not download them. */
export function isPreviewOnlyRole(role) {
  const value = normalizeRole(role);
  return !value || PREVIEW_ONLY_ROLES.has(value);
}

export function wantsAttachmentDownload(query = {}) {
  const flag = String(query.download ?? query.disposition ?? '').trim().toLowerCase();
  return flag === '1' || flag === 'true' || flag === 'yes' || flag === 'attachment' || flag === 'download';
}

export function inlinePreviewDisposition(fileName) {
  const safe = String(fileName || 'document').replace(/"/g, '');
  return `inline; filename="${safe}"`;
}
