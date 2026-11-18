import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  isPreviewOnlyRole,
  wantsAttachmentDownload,
  inlinePreviewDisposition,
} from '../shared/documentAccess.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];
const assert = (ok, message) => {
  if (!ok) failures.push(message);
};

const files = [
  'components/SimpleDocViewer.tsx',
  'components/DocumentViewer.tsx',
  'components/SimpleDocUpload.tsx',
  'components/TrainingTargets.tsx',
  'services/trainingTargetsService.ts',
];

for (const file of files) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  assert(!source.includes('link.download'), `${file} still saves a file`);
  assert(!source.includes('a.download'), `${file} still saves a file`);
  assert(!source.includes('>Download<') && !source.includes('⬇️ Download') && !source.includes('📥 Download'), `${file} still shows a download button`);
}

const training = fs.readFileSync(path.join(root, 'services/trainingTargetsService.ts'), 'utf8');
assert(training.includes('Download is not available'), 'training download helper still saves the file');

const route = fs.readFileSync(path.join(root, 'server/index.js'), 'utf8');
const handler = route.slice(route.indexOf("'/api/training/documents/:id/download'"));
assert(handler.includes('inlinePreviewDisposition'), 'training file is not served inline');
assert(handler.includes('wantsAttachmentDownload'), 'explicit download is not rejected');
assert(!handler.includes('attachment; filename'), 'training file is still sent as a download');

assert(isPreviewOnlyRole('User') && isPreviewOnlyRole('Admin') && isPreviewOnlyRole('SuperAdmin') && isPreviewOnlyRole('SubAdmin'), 'user and admin roles can still download');
assert(wantsAttachmentDownload({ download: '1' }) && wantsAttachmentDownload({ disposition: 'attachment' }), 'download request was not detected');
assert(!wantsAttachmentDownload({}), 'a preview request was treated as a download');
assert(inlinePreviewDisposition('plan.pdf').startsWith('inline;'), 'preview disposition is not inline');

if (failures.length) {
  console.error(failures.map((item) => `FAIL ${item}`).join('\n'));
  process.exit(1);
}

console.log('PASS user and admin roles are preview-only');
console.log('PASS document screens have no download action');
console.log('PASS training files are served inline and reject an explicit download');
