/**
 * Offline verification for meeting check-in identity safeguards.
 * Run: node server/scripts/verify-meeting-checkin-identity.js
 */
import assert from 'assert';
import { evaluateCheckInIdentity, resolveIdentityEmail } from '../../shared/meetingCheckInIdentity.js';

const users = [
  { email: 'canamrakesh@gmail.com', name: 'Rakesh Admin', role: 'SuperAdmin' },
  { email: '5doc.check@gmail.com', name: 'Amrit Pal Singh', role: 'Account Manager' },
  { email: 'alka.iapply@gmail.com', name: 'Alka Gupta', role: 'Account Manager' },
];

function check(label, actual, expectedMatch) {
  assert.strictEqual(
    actual.match,
    expectedMatch,
    `${label}: expected match=${expectedMatch}, got ${JSON.stringify(actual)}`
  );
  console.log(`OK  ${label}`);
}

// For Sure Immigration bug case: Rakesh session + Amritpal AM email
check(
  'blocks Rakesh session when AM is Amritpal email',
  evaluateCheckInIdentity({
    currentUserEmail: 'canamrakesh@gmail.com',
    currentUserName: 'Rakesh Admin',
    salesPersonName: '5doc.check@gmail.com',
    accountManager: '5doc.check@gmail.com',
    users,
  }),
  false
);

// Correct Amritpal session
check(
  'allows Amritpal session for his own AM email',
  evaluateCheckInIdentity({
    currentUserEmail: '5doc.check@gmail.com',
    currentUserName: 'Amrit Pal Singh',
    salesPersonName: '5doc.check@gmail.com',
    accountManager: '5doc.check@gmail.com',
    users,
  }),
  true
);

// Name-based AM field
check(
  'allows Amritpal when AM is display name',
  evaluateCheckInIdentity({
    currentUserEmail: '5doc.check@gmail.com',
    currentUserName: 'Amrit Pal Singh',
    salesPersonName: 'Amrit Pal Singh',
    accountManager: '',
    users,
  }),
  true
);

check(
  'blocks Rakesh when AM is Amritpal display name',
  evaluateCheckInIdentity({
    currentUserEmail: 'canamrakesh@gmail.com',
    currentUserName: 'Rakesh Admin',
    salesPersonName: 'Amrit Pal Singh',
    accountManager: '',
    users,
  }),
  false
);

// Unresolved free text should not hard-block
check(
  'allows unresolved free-text AM label',
  evaluateCheckInIdentity({
    currentUserEmail: '5doc.check@gmail.com',
    currentUserName: 'Amrit Pal Singh',
    salesPersonName: 'Field visit note',
    accountManager: '',
    users,
  }),
  true
);

assert.strictEqual(resolveIdentityEmail('Amrit Pal Singh', users), '5doc.check@gmail.com');
assert.strictEqual(resolveIdentityEmail('5doc.check@gmail.com', users), '5doc.check@gmail.com');
console.log('OK  resolveIdentityEmail helpers');

console.log('\nAll meeting check-in identity checks passed.');
