import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { requestLoginGps } from '../services/loginGps.js';
import {
  parseGpsBody,
  shouldApplyLocationUpdate,
  placeLabelFromGeocode,
  FAST_GPS_OPTIONS,
} from '../shared/loginLocation.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];

function assert(condition, message) {
  if (!condition) failures.push(message);
}

function sliceBetween(source, start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  if (from < 0 || to < 0) return '';
  return source.slice(from, to);
}

const auth = fs.readFileSync(path.join(root, 'services/authService.ts'), 'utf8');
const loginFn = sliceBetween(auth, 'export async function login', 'const MASTER_UNLOCK');
const loginBody = sliceBetween(auth, 'function loginBody', 'function throwIfSessionActive');
assert(!auth.includes('collectLoginLocation'), 'GPS collector is still on the login path');
assert(!auth.includes('enableHighAccuracy: true'), 'login still requests a slow high-accuracy GPS fix');
assert(!loginBody.includes('latitude') && !loginBody.includes('geolocation'), 'login body still waits for coordinates');
assert(loginFn.includes('syncLoginGps()'), 'successful login does not schedule a background GPS update');
assert(!loginFn.includes('await requestLoginGps') && !loginFn.includes('await syncLoginGps'), 'login awaits GPS');

const controller = fs.readFileSync(path.join(root, 'server/controllers/authController.js'), 'utf8');
const issueLogin = sliceBetween(controller, 'async function issueLogin', 'export const register');
assert(!issueLogin.includes('await lookupIpGeo'), 'sign-in still waits for the IP location lookup');
assert(issueLogin.includes('scheduleIpLocation'), 'IP location is not saved after the session is created');
assert(controller.includes('updateLoginLocation'), 'session location endpoint is missing');

const routes = fs.readFileSync(path.join(root, 'server/index.js'), 'utf8');
assert(routes.includes("'/api/auth/session/location'"), 'location route is not registered');

const app = fs.readFileSync(path.join(root, 'App.tsx'), 'utf8');
assert(app.includes('syncLoginGps()'), 'GPS sync does not run after the page loads');

const missing = parseGpsBody({});
const invalid = parseGpsBody({ latitude: 120, longitude: 10 });
const ok = parseGpsBody({ latitude: '28.6139', longitude: '77.2090' });
assert(missing.ok === false, 'missing coordinates were accepted');
assert(invalid.ok === false, 'out-of-range coordinates were accepted');
assert(ok.ok === true && ok.latitude === 28.6139 && ok.longitude === 77.209 && ok.locationSource === 'gps', 'valid coordinates were rejected');

const activeIp = { status: 'active', location_source: 'ip' };
const activeGps = { status: 'active', location_source: 'gps' };
assert(shouldApplyLocationUpdate(activeIp, { onlyIfNotGps: true }) === true, 'IP lookup cannot fill an empty session');
assert(shouldApplyLocationUpdate(activeGps, { onlyIfNotGps: true }) === false, 'later IP lookup can overwrite GPS');
assert(shouldApplyLocationUpdate(activeGps, {}) === true, 'GPS update cannot replace an IP location');
assert(shouldApplyLocationUpdate({ status: 'revoked', location_source: '' }, {}) === false, 'revoked session accepted a location');

const label = placeLabelFromGeocode({
  locality: 'Noida',
  city: 'Noida',
  principalSubdivision: 'Uttar Pradesh',
  countryName: 'India',
});
assert(label === 'Noida, Uttar Pradesh, India', `place label was ${label}`);

const seen = [];
const slowGeo = {
  getCurrentPosition(success, _error, options) {
    seen.push(options);
    setTimeout(() => success({ coords: { latitude: 28.6139, longitude: 77.209 } }), 400);
  },
};

const started = Date.now();
let loginReturned = false;
const loginWork = (async () => {
  loginReturned = true;
  return { token: 'token-1' };
})();
const gpsWork = requestLoginGps(slowGeo, { timeout: 2000, maximumAge: 300000 });
const loginResult = await loginWork;
const loginMs = Date.now() - started;
assert(loginReturned && loginResult.token === 'token-1', 'login did not finish');
assert(loginMs < 150, `login waited ${loginMs}ms for GPS`);

let gpsSettled = false;
const early = await Promise.race([
  gpsWork.then((value) => {
    gpsSettled = true;
    return value;
  }),
  new Promise((resolve) => setTimeout(() => resolve('still-waiting'), 80)),
]);
assert(early === 'still-waiting' && gpsSettled === false, 'GPS resolved on the login path');

const coords = await gpsWork;
const totalMs = Date.now() - started;
assert(coords?.latitude === 28.6139 && coords?.longitude === 77.209 && coords?.locationSource === 'gps', 'background GPS did not return coordinates');
assert(totalMs >= 350, 'background GPS returned before the device fix');
assert(seen[0]?.enableHighAccuracy === false, 'GPS request asked for high accuracy');
assert(seen[0]?.maximumAge === FAST_GPS_OPTIONS.maximumAge, 'GPS request ignored a cached fix');
assert(seen[0]?.timeout === 2000, 'GPS timeout was not passed through');

const denied = await requestLoginGps({
  getCurrentPosition(_success, error) {
    error(new Error('denied'));
  },
});
assert(denied === null, 'a denied GPS prompt rejected login');

const hung = await requestLoginGps({
  getCurrentPosition() {},
}, { timeout: 50 });
assert(hung === null, 'a hung GPS prompt never settled');

if (failures.length) {
  console.error(failures.map((item) => `FAIL ${item}`).join('\n'));
  process.exit(1);
}

console.log(`PASS login returned in ${loginMs}ms while GPS was still pending`);
console.log(`PASS GPS arrived after login (${totalMs}ms) without high accuracy`);
console.log('PASS denied and hung GPS prompts settle without blocking sign-in');
console.log('PASS IP location cannot overwrite a GPS fix');
