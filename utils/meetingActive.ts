import type { MeetingCheckInRecord } from '../types';

function cleanEmail(value?: string | null): string {
  return String(value || '').trim().toLowerCase();
}

function localDateKey(value?: string | Date | null): string {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) {
    const raw = String(value);
    return raw.length >= 10 ? raw.slice(0, 10) : '';
  }
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function todayLocalDateKey(now = new Date()): string {
  return localDateKey(now);
}

/** True when the meeting check-in is currently active (not completed / checked out). */
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

  if (status === 'completed' || status === 'ended' || status === 'done') return false;
  if (meeting.checkOutTime) return false;

  // Prefer explicit active flag; otherwise treat open (no checkout) as active only for today.
  const today = todayLocalDateKey(opts.now);
  const meetingDay =
    localDateKey(meeting.date) ||
    localDateKey(meeting.checkInTime) ||
    '';
  if (meetingDay && meetingDay !== today) return false;

  if (status && status !== 'active') return false;
  return true;
}

export function meetingBelongsToUser(
  meeting: Partial<MeetingCheckInRecord> & { Username?: string; salesPersonEmail?: string } | null | undefined,
  userEmail?: string | null
): boolean {
  const email = cleanEmail(userEmail);
  if (!email || !meeting) return false;
  return (
    cleanEmail(meeting.username) === email ||
    cleanEmail((meeting as any).Username) === email ||
    cleanEmail(meeting.salesPersonEmail) === email ||
    cleanEmail(meeting.createdBy) === email
  );
}

/** Header button: current user is personally in an active meeting. */
export function userHasActiveMeeting(
  meetings: Array<Partial<MeetingCheckInRecord>> | null | undefined,
  userEmail?: string | null,
  now = new Date()
): boolean {
  if (!userEmail || !Array.isArray(meetings)) return false;
  return meetings.some(
    (m) => meetingBelongsToUser(m, userEmail) && isActiveMeetingRecord(m, { now })
  );
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
