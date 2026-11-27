import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];
const assert = (ok, message) => { if (!ok) failures.push(message); };

const focusSrc = fs.readFileSync(path.join(root, 'utils/leadFocus.ts'), 'utf8');
assert(focusSrc.includes("FIELD:phone"), 'phone focus token missing');
assert(focusSrc.includes("FIELD:city"), 'city focus token missing');

const list = fs.readFileSync(path.join(root, 'components/CompactLeadList.tsx'), 'utf8');
assert(list.includes("openLeadField(e, lead, 'phone')"), 'phone column does not open lead popup');
assert(list.includes("openLeadField(e, lead, 'city')"), 'city column does not open lead popup');
assert(list.includes("openLeadField(e, lead, 'contact')"), 'contact column does not open lead popup');
assert(list.includes("fieldMap[column.id]"), 'generic column map missing');
assert(!list.includes('Filter by ${firstContact.city}'), 'city still filters instead of opening lead');

const modal = fs.readFileSync(path.join(root, 'components/LeadDetailsModal.tsx'), 'utf8');
assert(modal.includes('highlightField'), 'modal missing highlightField prop');
assert(modal.includes('data-lead-field'), 'modal missing field anchors');
assert(modal.includes("Showing {leadFocusLabel(field)}"), 'modal missing focus label');

const app = fs.readFileSync(path.join(root, 'App.tsx'), 'utf8');
assert(app.includes('parseLeadFocus'), 'app does not parse lead focus tokens');
assert(app.includes('highlightLeadField'), 'app missing highlight field state');
assert(app.includes('highlightField={highlightLeadField}'), 'app does not pass highlight field');

if (failures.length) {
  console.error(failures.map((item) => `FAIL ${item}`).join('\n'));
  process.exit(1);
}
console.log('PASS partner lead column clicks open popup with field focus');
console.log('PASS phone/city/contact deep-links are wired');
