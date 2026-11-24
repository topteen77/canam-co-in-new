const FOLLOW_UP_MARK = /(?:^|\n)__followUpId:(\S+)/;

export interface ScheduledMeetingStart {
  followUpId: string;
  leadId: string;
  leadName: string;
  notes?: string;
  meetingLink?: string;
  scheduledBy?: string;
  accountManagerName: string;
}

export function withScheduledFollowUpId(notes: string, followUpId: string): string {
  const clean = stripScheduledFollowUpId(notes);
  const id = String(followUpId || '').trim();
  if (!id) return clean;
  return [clean, `__followUpId:${id}`].filter(Boolean).join('\n');
}

export function readScheduledFollowUpId(notes?: string | null): string {
  const match = String(notes || '').match(FOLLOW_UP_MARK);
  return match?.[1] || '';
}

export function stripScheduledFollowUpId(notes?: string | null): string {
  return String(notes || '').replace(FOLLOW_UP_MARK, '').replace(/\n{2,}/g, '\n').trim();
}
