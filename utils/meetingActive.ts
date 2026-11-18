import type { MeetingCheckInRecord } from '../types';

function cleanEmail(value?: string | null): string {
  return String(value || '').trim().toLowerCase();
}

/** Extract an email from plain text or a JSON user blob stored in older rows. */
export function extractMeetingUserEmail(value?: unknown): string {
  if (value == null) return '';
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    return cleanEmail(String(obj.email || obj.userEmail || obj.username || ''));
  }
  const raw = String(value).trim();
  if (!raw) return '';
  if (raw.startsWith('{')) {
    try {
      const parsed = JSON.parse(raw);
      return extractMeetingUserEmail(parsed);
    } catch {
      // fall through
    }
  }
  return cleanEmail(raw);
}

function localDateKey(value?: string | Date | null): string {
  if (!value) return '';
  if (typeof value === 'object' && value !== null && !((value as Date) instanceof Date)) {
    const obj = value as { _seconds?: number; seconds?: number };
    const seconds = Number(obj._seconds ?? obj.seconds);
    if (Number.isFinite(seconds) && seconds > 0) {
      return localDateKey(new Date(seconds * 1000));
    }
  }
  const asString = String(value).trim();
  // Prefer YYYY-MM-DD prefix when present (avoids UTC/local day shifts).
  const ymd = asString.match(/^(\d{4}-\d{2}-\d{2})/);
  if (ymd) return ymd[1];

  const d = value instanceof Date ? value : new Date(asString);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseCheckInInstant(value?: unknown): Date | null {
  if (!value) return null;
  if (typeof value === 'object' && value !== null) {
    const obj = value as { _seconds?: number; seconds?: number };
    const seconds = Number(obj._seconds ?? obj.seconds);
    if (Number.isFinite(seconds) && seconds > 0) return new Date(seconds * 1000);
  }
  const asString = String(value).trim();
  if (asString.startsWith('{')) {
    try {
      return parseCheckInInstant(JSON.parse(asString));
    } catch {
      return null;
    }
  }
  const d = new Date(asString);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function todayLocalDateKey(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * True only for a meeting that is actively in progress right now:
 * - meetingStatus is explicitly "active"
 * - no checkout
 * - meeting date / check-in is today (local)
 */
export function isActiveMeetingRecord(
  meeting: Partial<MeetingCheckInRecord> & { meeting_status?: string; Username?: string } | null | undefined,
  opts: { now?: Date } = {}
): boolean {
  if (!meeting) return false;

  const status = String(
    meeting.meetingStatus || (meeting as any).meeting_status || ''
  )
    .trim()
    .toLowerCase();

  // Must be explicitly active — stale rows often keep status=active forever, so also require today.
  if (status !== 'active') return false;

  const checkedOut = meeting.checkOutTime || (meeting as any).check_out_time;
  if (checkedOut) return false;

  const now = opts.now || new Date();
  const today = todayLocalDateKey(now);
  const meetingDay =
    localDateKey(meeting.date) ||
    localDateKey(meeting.checkInTime as any) ||
    localDateKey(parseCheckInInstant(meeting.checkInTime));

  // No usable day => not active (prevents false positives from bad/legacy rows).
  if (!meetingDay || meetingDay !== today) return false;

  return true;
}

export function meetingBelongsToUser(
  meeting: Partial<MeetingCheckInRecord> & { Username?: string; salesPersonEmail?: string } | null | undefined,
  userEmail?: string | null
): boolean {
  const email = cleanEmail(userEmail);
  if (!email || !meeting) return false;
  const candidates = [
    extractMeetingUserEmail(meeting.username),
    extractMeetingUserEmail((meeting as any).Username),
    extractMeetingUserEmail(meeting.salesPersonEmail),
  ].filter(Boolean);
  return candidates.includes(email);
}

/** Current user's active meeting record (newest first), or null. */
export function getActiveMeetingForUser(
  meetings: Array<Partial<MeetingCheckInRecord>> | null | undefined,
  userEmail?: string | null,
  now = new Date()
): Partial<MeetingCheckInRecord> | null {
  if (!userEmail || !Array.isArray(meetings)) return null;
  const mine = meetings.filter(
    (m) => meetingBelongsToUser(m, userEmail) && isActiveMeetingRecord(m, { now })
  );
  if (mine.length === 0) return null;
  mine.sort((a, b) => {
    const ta = new Date(String(a.checkInTime || a.date || 0)).getTime();
    const tb = new Date(String(b.checkInTime || b.date || 0)).getTime();
    return (Number.isFinite(tb) ? tb : 0) - (Number.isFinite(ta) ? ta : 0);
  });
  return mine[0] || null;
}

/** Header button: current user is personally in an active meeting. */
export function userHasActiveMeeting(
  meetings: Array<Partial<MeetingCheckInRecord>> | null | undefined,
  userEmail?: string | null,
  now = new Date()
): boolean {
  return Boolean(getActiveMeetingForUser(meetings, userEmail, now));
}

/** Human-readable hover text explaining why the header shows In Meeting. */
export function describeActiveMeetingReason(
  meeting: Partial<MeetingCheckInRecord> | null | undefined,
  opts: { userEmail?: string | null } = {}
): string {
  if (!meeting) return 'Meeting check-in';
  const lead = String(meeting.leadName || meeting.leadId || 'Unknown lead').trim();
  const type = String(meeting.meetingType || '').trim();
  const status = String(meeting.meetingStatus || (meeting as any).meeting_status || 'active').trim();
  let started = '';
  try {
    const raw = meeting.checkInTime;
    if (raw) {
      const d = new Date(String(raw));
      if (!Number.isNaN(d.getTime())) {
        started = d.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour12: true });
      }
    }
  } catch {
    started = '';
  }
  const id = meeting.id != null ? String(meeting.id) : '';
  const who = opts.userEmail ? String(opts.userEmail) : '';
  const lines = [
    'In Meeting — active check-in for you',
    who ? `User: ${who}` : '',
    `Lead: ${lead}`,
    type ? `Type: ${type}` : '',
    started ? `Started: ${started}` : '',
    `Status: ${status} (today, no checkout)`,
    id ? `Meeting ID: ${id}` : '',
  ].filter(Boolean);
  return lines.join('\n');
}

/**
 * Lead “Live Meeting” cell:
 * - Non-admin: only the current user's active meeting on this lead
 * - Admin: any user's active meeting on this lead (team visibility)
 */
export function getActiveMeetingForLead(
  meetings: Array<Partial<MeetingCheckInRecord>> | null | undefined,
  opts: {
    leadId?: string | null;
    currentUser?: string | null;
    isAdmin?: boolean;
    now?: Date;
  }
): Partial<MeetingCheckInRecord> | null {
  if (!opts.leadId || !Array.isArray(meetings)) return null;
  const now = opts.now || new Date();
  const match = meetings.find((m) => {
    if (String(m.leadId || '') !== String(opts.leadId)) return false;
    if (!isActiveMeetingRecord(m, { now })) return false;
    if (opts.isAdmin) return true;
    return meetingBelongsToUser(m, opts.currentUser);
  });
  return match || null;
}

export function countActiveMeetings(
  meetings: Array<Partial<MeetingCheckInRecord>> | null | undefined,
  opts: { currentUser?: string | null; isAdmin?: boolean; now?: Date } = {}
): number {
  if (!Array.isArray(meetings)) return 0;
  const now = opts.now || new Date();
  return meetings.filter((m) => {
    if (!isActiveMeetingRecord(m, { now })) return false;
    if (opts.isAdmin) return true;
    return meetingBelongsToUser(m, opts.currentUser);
  }).length;
}
