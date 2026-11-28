/**
 * Meeting check-in identity helpers (shared by API + UI).
 * Prevents attributing a meeting to the wrong logged-in session on shared devices.
 */

export function normalizeIdentity(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function looksLikeEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

/**
 * Resolve a free-text Account Manager / lead AM value to a canonical email when possible.
 * Returns null when the value is blank or an unresolved free-text label.
 */
export function resolveIdentityEmail(value, users = []) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const norm = normalizeIdentity(raw);
  const list = Array.isArray(users) ? users : [];

  const byEmail = list.find((u) => normalizeIdentity(u?.email) === norm);
  if (byEmail?.email) return normalizeIdentity(byEmail.email);

  const byName = list.find((u) => normalizeIdentity(u?.name) === norm);
  if (byName?.email) return normalizeIdentity(byName.email);

  if (looksLikeEmail(raw)) return norm;
  return null;
}

export function currentUserAliases(currentUserEmail, currentUserName = '', users = []) {
  const aliases = new Set();
  const email = normalizeIdentity(currentUserEmail);
  const name = normalizeIdentity(currentUserName);
  if (email) aliases.add(email);
  if (name) aliases.add(name);

  const list = Array.isArray(users) ? users : [];
  for (const u of list) {
    const uEmail = normalizeIdentity(u?.email);
    const uName = normalizeIdentity(u?.name);
    if ((email && uEmail === email) || (name && uName === name) || (email && uName === email) || (name && uEmail === name)) {
      if (uEmail) aliases.add(uEmail);
      if (uName) aliases.add(uName);
    }
  }
  return aliases;
}

/**
 * True when Account Manager / lead AM points at a different known user than the logged-in session.
 */
export function evaluateCheckInIdentity({
  currentUserEmail,
  currentUserName = '',
  salesPersonName = '',
  accountManager = '',
  users = [],
} = {}) {
  const me = currentUserAliases(currentUserEmail, currentUserName, users);
  if (!me.size) {
    return {
      match: false,
      code: 'NO_SESSION_USER',
      message: 'Sign in again before starting a meeting.',
      conflictingEmail: null,
      conflictingLabel: '',
    };
  }

  const candidates = [
    resolveIdentityEmail(salesPersonName, users),
    resolveIdentityEmail(accountManager, users),
  ].filter(Boolean);

  if (candidates.length === 0) {
    // Free-text AM that is not a known user email/name — also accept exact name/email alias match.
    const freeText = [salesPersonName, accountManager]
      .map(normalizeIdentity)
      .filter(Boolean);
    if (freeText.some((v) => me.has(v))) {
      return { match: true, code: 'OK', message: '', conflictingEmail: null, conflictingLabel: '' };
    }
    return { match: true, code: 'OK_UNRESOLVED', message: '', conflictingEmail: null, conflictingLabel: '' };
  }

  if (candidates.some((c) => me.has(c))) {
    return { match: true, code: 'OK', message: '', conflictingEmail: null, conflictingLabel: '' };
  }

  const conflictingEmail = candidates[0];
  const list = Array.isArray(users) ? users : [];
  const conflictUser = list.find((u) => normalizeIdentity(u?.email) === conflictingEmail);
  const conflictingLabel =
    (conflictUser?.name && String(conflictUser.name).trim()) ||
    String(salesPersonName || accountManager || conflictingEmail).trim();

  return {
    match: false,
    code: 'IDENTITY_MISMATCH',
    message:
      `You are signed in as ${currentUserName || currentUserEmail}, but this meeting is for ${conflictingLabel}. ` +
      'Log out and sign in with the correct account, or ask an admin to override.',
    conflictingEmail,
    conflictingLabel,
  };
}
