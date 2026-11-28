import React, { useEffect, useMemo, useState } from 'react';
import type { Lead, FollowUp, MeetingCheckInRecord } from '../types';
import { PlusIcon } from './icons/SparklesIcon';
import { SearchableFilterSelect } from './SearchableFilterSelect';
import { getUserDisplayName } from '../utils/dataCleaning';
import { canFixBlankMeetingMeta, emailsMatch, resolveAccountManagerEmail } from '../utils/leadPermissions';
import { isActiveMeetingRecord, meetingBelongsToUser, userHasActiveMeeting } from '../utils/meetingActive';
import { readScheduledFollowUpId, stripScheduledFollowUpId, type ScheduledMeetingStart } from '../utils/scheduledMeeting';
import { canStartScheduledMeeting } from '../shared/meetingCheckInIdentity.js';

type MeetingItem = FollowUp & {
  leadId: string;
  agencyName: string;
  isCheckIn?: boolean;
  creatorLabel?: string;
  accountManager?: string;
  salesPerson?: string;
  city?: string;
  meetingOutcome?: MeetingCheckInRecord['meetingOutcome'] | string;
};

type MeetingOutcomeValue = 'successful' | 'rescheduled' | 'cancelled' | 'no_show' | 'other';

type MeetingThread = {
  key: string;
  primary: MeetingItem;
  others: MeetingItem[];
};

interface MeetingPlannerProps {
  leads: Lead[];
  meetingCheckInRecords?: MeetingCheckInRecord[];
  availableUsers?: Array<{ id?: string; name?: string; email?: string; role?: string }>;
  currentUser?: string | null;
  isAdmin?: boolean;
  canViewAllMeetings?: boolean;
  selectedDate?: Date | null;
  onSelectedDateChange?: (date: Date | null) => void;
  /** Shared with Completed Meetings so client search filters both lists. */
  agentFilter?: string;
  onAgentFilterChange?: (agent: string) => void;
  onUpdateLead: (lead: Lead) => void;
  onPlanNewMeeting: () => void;
  onStartScheduledMeeting?: (meeting: ScheduledMeetingStart) => void;
}

const OUTCOME_OPTIONS: Array<{ value: MeetingOutcomeValue; label: string }> = [
  { value: 'successful', label: 'Successful' },
  { value: 'rescheduled', label: 'Rescheduled (same meeting)' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'no_show', label: 'No Show / agent not joining' },
  { value: 'other', label: 'Other' },
];

function normalizeOutcome(raw: string): MeetingOutcomeValue | null {
  const value = String(raw || '').trim().toLowerCase().replace(/\s+/g, '_');
  if (value === 'successful' || value === 'rescheduled' || value === 'cancelled' || value === 'no_show' || value === 'other') {
    return value;
  }
  return null;
}

function parseMeetingOutcome(notes: string): MeetingOutcomeValue | null {
  const text = String(notes || '');
  const outcomeMatch = text.match(/Outcome:\s*([a-z_ ]+)/i);
  if (outcomeMatch?.[1]) {
    const parsed = normalizeOutcome(outcomeMatch[1].split(/[—\-–]/)[0] || '');
    if (parsed) return parsed;
  }
  const rescheduleMatch = text.match(/Rescheduled\s*\(([a-z_ ]+)\)/i);
  if (rescheduleMatch?.[1]) {
    return normalizeOutcome(rescheduleMatch[1]) || 'rescheduled';
  }
  return null;
}

function outcomeLabel(outcome: MeetingOutcomeValue): string {
  return OUTCOME_OPTIONS.find((option) => option.value === outcome)?.label
    || outcome.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function resolveMeetingOutcome(meeting: MeetingItem): MeetingOutcomeValue | null {
  const fromField = normalizeOutcome(String(meeting.meetingOutcome || ''));
  if (fromField) return fromField;
  const fromNotes = parseMeetingOutcome(meeting.notes || '');
  if (fromNotes) return fromNotes;
  const notes = String(meeting.notes || '').toLowerCase();
  if (/reschedul/.test(notes)) return 'rescheduled';
  if (/no[\s_-]?show/.test(notes)) return 'no_show';
  if (/cancel/.test(notes)) return 'cancelled';
  return null;
}

function meetingBadgeLabel(meeting: MeetingItem): string {
  const outcome = resolveMeetingOutcome(meeting);
  if (outcome) return outcomeLabel(outcome);
  return meeting.status;
}

function meetingBadgeClass(meeting: MeetingItem): string {
  const outcome = resolveMeetingOutcome(meeting);
  if (outcome === 'successful') return 'bg-green-100 text-green-800';
  if (outcome === 'rescheduled' || outcome === 'no_show') return 'bg-sky-100 text-sky-800';
  if (outcome === 'cancelled') return 'bg-rose-100 text-rose-800';
  if (outcome === 'other') return 'bg-slate-100 text-slate-800';
  if (meeting.status === 'Done') return 'bg-green-100 text-green-800';
  return 'bg-amber-100 text-amber-800';
}

function meetingTimeMs(meeting: MeetingItem): number {
  const time = new Date(meeting.date).getTime();
  return Number.isNaN(time) ? 0 : time;
}

function threadKeyFor(meeting: MeetingItem): string {
  return String(meeting.leadId || meeting.agencyName || meeting.id);
}

function normalizeMeetingUrl(raw: string): string {
  const value = String(raw || '').trim();
  if (!value) return '';
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return value;
  return `https://${value}`;
}

function meetingLinkLabel(raw: string): string {
  const lower = String(raw || '').toLowerCase();
  if (lower.includes('zoom.')) return 'Join Zoom';
  if (lower.includes('meet.google.') || lower.includes('google.com/meet')) return 'Join Google Meet';
  if (lower.includes('teams.microsoft.') || lower.includes('teams.live.')) return 'Join Teams';
  if (lower.includes('webex.')) return 'Join Webex';
  return 'Open meeting link';
}

function leadCity(lead?: Lead | null): string {
  const contacts = Array.isArray(lead?.contacts) ? lead.contacts : [];
  return contacts.map((contact) => String(contact.city || '').trim()).find(Boolean) || '';
}

function uniqueSorted(values: string[]): string[] {
  const seen = new Map<string, string>();
  values.forEach((value) => {
    const trimmed = String(value || '').trim();
    if (!trimmed || trimmed === '—') return;
    const key = trimmed.toLowerCase();
    if (!seen.has(key)) seen.set(key, trimmed);
  });
  return Array.from(seen.values()).sort((a, b) => a.localeCompare(b));
}

/** Stable YYYY-MM-DD in local time (avoids UTC date-only shift bugs). */
function localDateKey(input: Date | string | null | undefined): string {
  if (input == null) return '';
  if (typeof input === 'string') {
    const match = input.trim().match(/^(\d{4}-\d{2}-\d{2})/);
    if (match) return match[1];
  }
  const date = input instanceof Date ? input : new Date(input);
  if (isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function namesMatch(a?: string, b?: string): boolean {
  return String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
}

function openMeetingLink(raw: string) {
  const url = normalizeMeetingUrl(raw);
  if (!url) return;
  window.open(url, '_blank', 'noopener,noreferrer');
}

const Calendar: React.FC<{
  meetings: MeetingItem[];
  onDateSelect: (date: Date | null) => void;
  selectedDate: Date | null;
}> = ({ meetings, onDateSelect, selectedDate }) => {
  const [currentDate, setCurrentDate] = useState(new Date());

  const meetingDays = useMemo(() => {
    const safe = Array.isArray(meetings) ? meetings : [];
    return new Set(
      safe
        .map((m) => localDateKey(m.date) || null)
        .filter(Boolean) as string[]
    );
  }, [meetings]);

  const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
  const endOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
  const startDay = startOfMonth.getDay();
  const daysInMonth = endOfMonth.getDate();

  const days = Array.from(
    { length: daysInMonth },
    (_, i) => new Date(currentDate.getFullYear(), currentDate.getMonth(), i + 1)
  );
  const blanks = Array.from({ length: startDay }, () => null);

  const changeMonth = (offset: number) => {
    setCurrentDate((prev) => new Date(prev.getFullYear(), prev.getMonth() + offset, 1));
  };

  return (
    <div className="bg-white p-3 sm:p-4 rounded-xl shadow-sm sm:shadow-lg border border-slate-200">
      <div className="flex justify-between items-center mb-3 sm:mb-4">
        <button
          onClick={() => changeMonth(-1)}
          className="app-icon-btn p-2 min-h-[44px] min-w-[44px] rounded-full hover:bg-slate-100 text-slate-600"
          aria-label="Previous month"
        >
          &larr;
        </button>
        <h3 className="font-bold text-base sm:text-lg text-slate-800">
          {currentDate.toLocaleString('default', { month: 'long', year: 'numeric' })}
        </h3>
        <button
          onClick={() => changeMonth(1)}
          className="app-icon-btn p-2 min-h-[44px] min-w-[44px] rounded-full hover:bg-slate-100 text-slate-600"
          aria-label="Next month"
        >
          &rarr;
        </button>
      </div>
      <div className="grid grid-cols-7 gap-0.5 sm:gap-1 text-center text-xs sm:text-sm">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
          <div key={day} className="font-medium text-slate-500 py-1">
            <span className="sm:hidden">{day.slice(0, 1)}</span>
            <span className="hidden sm:inline">{day}</span>
          </div>
        ))}
        {blanks.map((_, i) => (
          <div key={`blank-${i}`} />
        ))}
        {days.map((day) => {
          const dayKey = localDateKey(day);
          const isToday = dayKey === localDateKey(new Date());
          const hasMeeting = meetingDays.has(dayKey);
          const isSelected = selectedDate ? localDateKey(selectedDate) === dayKey : false;
          return (
            <button
              key={dayKey}
              onClick={() => onDateSelect(isSelected ? null : day)}
              className={`app-icon-btn w-full aspect-square max-h-11 sm:max-h-none sm:w-9 sm:h-9 sm:aspect-auto mx-auto flex items-center justify-center rounded-full transition-colors relative
                ${isSelected ? 'bg-indigo-600 text-white' : ''}
                ${!isSelected && isToday ? 'bg-indigo-100 text-indigo-700' : ''}
                ${!isSelected && !isToday ? 'hover:bg-slate-100 text-slate-700' : ''}
              `}
            >
              {day.getDate()}
              {hasMeeting && (
                <span
                  className={`absolute bottom-1 w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-white' : 'bg-indigo-500'}`}
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};

function toLocalDateTimeValue(iso: string): string {
  const date = new Date(iso);
  if (isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export const ItineraryDisplay: React.FC<MeetingPlannerProps> = ({
  leads,
  meetingCheckInRecords = [],
  availableUsers = [],
  currentUser = null,
  isAdmin = false,
  canViewAllMeetings = false,
  selectedDate: selectedDateProp = null,
  onSelectedDateChange,
  agentFilter: agentFilterProp,
  onAgentFilterChange,
  onUpdateLead,
  onPlanNewMeeting,
  onStartScheduledMeeting,
}) => {
  const allMeetings = useMemo((): MeetingItem[] => {
    const fromLeads: MeetingItem[] = Array.isArray(leads)
      ? leads.flatMap((lead) => {
          const safeFollowUps = Array.isArray(lead.followUps) ? lead.followUps : [];
          return safeFollowUps
            .filter((f) => f.type === 'Meeting')
            .map((meeting) => ({
              ...meeting,
              leadId: lead.id,
              agencyName: lead.agencyName,
              isCheckIn: false,
              creatorLabel: meeting.createdBy
                ? getUserDisplayName(meeting.createdBy, availableUsers)
                : '',
              accountManager: lead.accountManager || '',
              salesPerson: lead.salesPerson || '',
              city: leadCity(lead),
            }));
        })
      : [];
    const fromCheckIns: MeetingItem[] = Array.isArray(meetingCheckInRecords)
      ? meetingCheckInRecords.map((r, i) => {
          const id = (r as { id?: string }).id ?? (r as { firebase_id?: string }).firebase_id ?? `checkin-${i}`;
          const dateStr = r.date || r.checkInTime || '';
          const status = r.meetingStatus === 'completed' ? ('Done' as const) : ('Planned' as const);
          const linkedLead = leads.find((lead) => String(lead.id) === String(r.leadId || ''));
          const markedFollowUpId = readScheduledFollowUpId(r.notes);
          const linkedFollowUp = (() => {
            const followUps = Array.isArray(linkedLead?.followUps) ? linkedLead!.followUps : [];
            if (markedFollowUpId) {
              const byId = followUps.find((f) => String(f.id) === String(markedFollowUpId));
              if (byId) return byId;
            }
            const day = localDateKey(dateStr);
            return followUps.find(
              (f) => String(f.type || '').toLowerCase() === 'meeting' && localDateKey(f.date) === day
            ) || null;
          })();
          const creatorRaw =
            linkedFollowUp?.createdBy
            || r.createdBy
            || r.salesPersonEmail
            || r.username
            || r.salesPersonName
            || '';
          return {
            id,
            type: 'Meeting' as const,
            status,
            date: dateStr,
            notes: stripScheduledFollowUpId(r.notes || (r as { completionNotes?: string }).completionNotes || ''),
            meetingLink: (r as { meetingLink?: string }).meetingLink || '',
            createdBy: creatorRaw,
            createdAt: linkedFollowUp?.createdAt || r.createdAt,
            assignedTo: linkedFollowUp?.assignedTo,
            backfilledByScript: linkedFollowUp?.backfilledByScript,
            backfilledFields: linkedFollowUp?.backfilledFields,
            leadId: r.leadId || '',
            agencyName: r.leadName || linkedLead?.agencyName || '—',
            isCheckIn: true,
            meetingOutcome: r.meetingOutcome,
            creatorLabel: creatorRaw
              ? r.salesPersonName || getUserDisplayName(creatorRaw, availableUsers)
              : '',
            accountManager: linkedLead?.accountManager || r.salesPersonEmail || r.username || '',
            salesPerson: linkedLead?.salesPerson || '',
            city: leadCity(linkedLead),
          };
        })
      : [];
    return [...fromLeads, ...fromCheckIns].sort((a, b) => {
      const dateA = new Date(a.date).getTime();
      const dateB = new Date(b.date).getTime();
      return (isNaN(dateA) ? 0 : dateA) - (isNaN(dateB) ? 0 : dateB);
    });
  }, [leads, meetingCheckInRecords, availableUsers]);

  const [selectedDateInternal, setSelectedDateInternal] = useState<Date | null>(null);
  const selectedDate = onSelectedDateChange ? selectedDateProp : selectedDateInternal;
  const setSelectedDate = (date: Date | null) => {
    if (onSelectedDateChange) onSelectedDateChange(date);
    else setSelectedDateInternal(date);
  };
  const [agentFilterInternal, setAgentFilterInternal] = useState('');
  const agentFilter = agentFilterProp !== undefined ? agentFilterProp : agentFilterInternal;
  const setAgentFilter = (next: string) => {
    if (onAgentFilterChange) onAgentFilterChange(next);
    if (agentFilterProp === undefined) setAgentFilterInternal(next);
  };
  const [managerFilter, setManagerFilter] = useState('');
  const [cityFilter, setCityFilter] = useState('');
  const [dateFromFilter, setDateFromFilter] = useState('');
  const [dateToFilter, setDateToFilter] = useState('');
  const [editingMeeting, setEditingMeeting] = useState<MeetingItem | null>(null);
  const [editDate, setEditDate] = useState('');
  const [editLink, setEditLink] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editCreatedAt, setEditCreatedAt] = useState('');
  const [editCreatedBy, setEditCreatedBy] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  const [expandedThreads, setExpandedThreads] = useState<Record<string, boolean>>({});
  const [outcomeMeeting, setOutcomeMeeting] = useState<MeetingItem | null>(null);
  const [outcomeValue, setOutcomeValue] = useState<MeetingOutcomeValue | ''>('');
  const [outcomeNotes, setOutcomeNotes] = useState('');
  const [outcomeRescheduleDate, setOutcomeRescheduleDate] = useState('');
  const [outcomeSaving, setOutcomeSaving] = useState(false);

  const visibleMeetings = useMemo(() => {
    if (canViewAllMeetings) return allMeetings;
    return allMeetings.filter((meeting) => (
      emailsMatch(meeting.accountManager, currentUser)
      || emailsMatch(meeting.salesPerson, currentUser)
      || emailsMatch(meeting.createdBy, currentUser)
    ));
  }, [allMeetings, canViewAllMeetings, currentUser]);

  const agentOptions = useMemo(() => {
    const fromMeetings = visibleMeetings.map((meeting) => meeting.agencyName);
    const fromLeads = (Array.isArray(leads) ? leads : [])
      .filter((lead) => (Array.isArray(lead.followUps) ? lead.followUps : []).some((f) => f.type === 'Meeting'))
      .map((lead) => lead.agencyName);
    return uniqueSorted([...fromMeetings, ...fromLeads]);
  }, [visibleMeetings, leads]);
  const managerOptions = useMemo(
    () => uniqueSorted(visibleMeetings.map((meeting) => meeting.accountManager || '')).map((email) => ({
      value: email,
      label: getUserDisplayName(email, availableUsers),
    })),
    [visibleMeetings, availableUsers]
  );
  const cityOptions = useMemo(
    () => uniqueSorted([
      ...visibleMeetings.map((meeting) => meeting.city || ''),
      ...(Array.isArray(leads) ? leads : []).flatMap((lead) => {
        const contacts = Array.isArray(lead.contacts) ? lead.contacts : [];
        return contacts.map((contact) => String(contact.city || '').trim());
      }),
    ]),
    [visibleMeetings, leads]
  );

  const filteredMeetings = useMemo(() => {
    const selectedKey = selectedDate ? localDateKey(selectedDate) : '';
    const todayKey = localDateKey(new Date());
    const fromKey = dateFromFilter ? localDateKey(dateFromFilter) : '';
    const toKey = dateToFilter ? localDateKey(dateToFilter) : '';
    return visibleMeetings.filter((meeting) => {
      // Upcoming list: only open meetings. Selected day: include Done so prior slots show in the client thread.
      if (!selectedDate && meeting.status === 'Done') return false;
      if (agentFilter && !namesMatch(meeting.agencyName, agentFilter)) return false;
      if (managerFilter && !emailsMatch(meeting.accountManager, managerFilter)) return false;
      if (cityFilter && (meeting.city || '').toLowerCase() !== cityFilter.toLowerCase()) return false;
      const meetingKey = localDateKey(meeting.date);
      if (!meetingKey) return false;
      if (selectedDate) {
        return meetingKey === selectedKey;
      }
      // Upcoming range: default from today, optionally narrowed by From/To filters.
      if (meetingKey < todayKey) return false;
      if (fromKey && meetingKey < fromKey) return false;
      if (toKey && meetingKey > toKey) return false;
      return true;
    });
  }, [visibleMeetings, agentFilter, managerFilter, cityFilter, selectedDate, dateFromFilter, dateToFilter]);

  const meetingThreads = useMemo((): MeetingThread[] => {
    const groups = new Map<string, MeetingItem[]>();
    filteredMeetings.forEach((meeting) => {
      const key = threadKeyFor(meeting);
      const list = groups.get(key) || [];
      list.push(meeting);
      groups.set(key, list);
    });
    return Array.from(groups.entries()).map(([key, items]) => {
      const sorted = [...items].sort((a, b) => meetingTimeMs(b) - meetingTimeMs(a));
      const planned = sorted.filter((item) => item.status === 'Planned' && !item.isCheckIn);
      const primary = planned[0] || sorted[0];
      const others = sorted.filter((item) => item.id !== primary.id);
      return { key, primary, others };
    }).sort((a, b) => meetingTimeMs(b.primary) - meetingTimeMs(a.primary));
  }, [filteredMeetings]);

  const selectedDateKey = selectedDate ? localDateKey(selectedDate) : '';

  // When a calendar date is selected, auto-open threads that contain that day’s meeting in history
  useEffect(() => {
    if (!selectedDateKey) return;
    setExpandedThreads((prev) => {
      const next = { ...prev };
      let changed = false;
      meetingThreads.forEach((thread) => {
        const hasSelectedInOthers = thread.others.some((m) => localDateKey(m.date) === selectedDateKey);
        if (hasSelectedInOthers && !next[thread.key]) {
          next[thread.key] = true;
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [selectedDateKey, meetingThreads]);

  const accountManagerName = currentUser
    ? getUserDisplayName(currentUser, availableUsers)
    : '';

  const userInActiveMeeting = useMemo(
    () => userHasActiveMeeting(meetingCheckInRecords, currentUser),
    [meetingCheckInRecords, currentUser]
  );

  const isActiveForThisLead = (meeting: MeetingItem) =>
    meetingCheckInRecords.some(
      (record) =>
        String(record.leadId || '') === String(meeting.leadId)
        && meetingBelongsToUser(record, currentUser)
        && isActiveMeetingRecord(record)
    );

  const meetingStartOwnership = (meeting: MeetingItem) =>
    canStartScheduledMeeting({
      currentUserEmail: currentUser || '',
      currentUserName: getUserDisplayName(currentUser || '', availableUsers),
      createdBy: meeting.createdBy || '',
      users: availableUsers,
    });

  const startScheduledMeeting = (meeting: MeetingItem) => {
    // Allow opening check-out for the active lead; block starting a different meeting
    if (userInActiveMeeting && !isActiveForThisLead(meeting)) {
      alert('You already have a meeting in progress. End that meeting before starting another.');
      return;
    }
    const ownership = meetingStartOwnership(meeting);
    if (!ownership.allowed && !isActiveForThisLead(meeting)) {
      alert(ownership.message || `Only ${ownership.ownerLabel || 'the scheduler'} can start this meeting.`);
      return;
    }
    onStartScheduledMeeting?.({
      followUpId: meeting.id,
      leadId: meeting.leadId,
      leadName: meeting.agencyName,
      notes: meeting.notes,
      meetingLink: meeting.meetingLink,
      scheduledBy: meeting.creatorLabel,
      accountManagerName: accountManagerName && accountManagerName !== 'N/A'
        ? accountManagerName
        : (meeting.creatorLabel || ''),
    });
  };

  const beginEditMeeting = (meeting: MeetingItem) => {
    if (meeting.isCheckIn) return;
    const lead = leads.find((row) => row.id === meeting.leadId);
    const canFixMeta = canFixBlankMeetingMeta(lead, {
      currentUser,
      isAdmin,
      createdAt: meeting.createdAt,
    });
    setEditingMeeting(meeting);
    setEditDate(toLocalDateTimeValue(meeting.date));
    setEditLink(meeting.meetingLink || '');
    setEditNotes(meeting.notes || '');
    setEditCreatedAt(canFixMeta ? toLocalDateTimeValue(new Date().toISOString()) : '');
    const amEmail = resolveAccountManagerEmail(lead?.accountManager, availableUsers);
    setEditCreatedBy(canFixMeta ? (meeting.createdBy || amEmail || currentUser || '') : '');
  };

  const cancelEditMeeting = () => {
    setEditingMeeting(null);
    setEditDate('');
    setEditLink('');
    setEditNotes('');
    setEditCreatedAt('');
    setEditCreatedBy('');
  };

  const saveEditMeeting = async () => {
    if (!editingMeeting || editingMeeting.isCheckIn) return;
    if (!editDate.trim()) {
      alert('Choose a date and time to reschedule this meeting.');
      return;
    }
    const lead = leads.find((row) => row.id === editingMeeting.leadId);
    if (!lead) {
      alert('Lead not found for this meeting.');
      return;
    }
    const canFixMeta = canFixBlankMeetingMeta(lead, {
      currentUser,
      isAdmin,
      createdAt: editingMeeting.createdAt,
    });
    if (canFixMeta) {
      if (!editCreatedAt.trim()) {
        alert('Set Meeting created date and time.');
        return;
      }
      if (!editCreatedBy.trim()) {
        alert('Select who scheduled this meeting.');
        return;
      }
    }
    try {
      setEditSaving(true);
      const nextDate = new Date(editDate).toISOString();
      const createdAtIso = canFixMeta && editCreatedAt.trim()
        ? new Date(editCreatedAt).toISOString()
        : undefined;
      const followUps = (Array.isArray(lead.followUps) ? lead.followUps : []).map((followUp) => {
        if (followUp.id !== editingMeeting.id) return followUp;
        const next: FollowUp = {
          ...followUp,
          status: 'Planned' as const,
          date: nextDate,
          meetingLink: editLink.trim() || undefined,
          notes: editNotes.trim(),
          updatedAt: new Date().toISOString(),
          updatedBy: currentUser || undefined,
        };
        if (canFixMeta && createdAtIso) {
          next.createdAt = createdAtIso;
          next.createdBy = editCreatedBy.trim();
          next.backfilledByScript = false;
          next.manuallyFixedAt = new Date().toISOString();
          next.manuallyFixedBy = currentUser || undefined;
        }
        return next;
      });
      await Promise.resolve(onUpdateLead({ ...lead, followUps }));
      cancelEditMeeting();
    } catch (err: any) {
      alert(err?.message || 'Failed to reschedule meeting');
    } finally {
      setEditSaving(false);
    }
  };

  const beginOutcomeMeeting = (meeting: MeetingItem) => {
    if (meeting.isCheckIn) return;
    setOutcomeMeeting(meeting);
    setOutcomeValue(parseMeetingOutcome(meeting.notes || '') || '');
    setOutcomeNotes('');
    setOutcomeRescheduleDate('');
    setEditingMeeting(null);
  };

  const cancelOutcomeMeeting = () => {
    setOutcomeMeeting(null);
    setOutcomeValue('');
    setOutcomeNotes('');
    setOutcomeRescheduleDate('');
  };

  const savePreviousOutcome = async () => {
    if (!outcomeMeeting || outcomeMeeting.isCheckIn) return;
    if (!outcomeValue) {
      alert('Select a previous meeting outcome.');
      return;
    }
    const notesRequired = outcomeNotes.trim();
    if (!notesRequired) {
      alert('Outcome comments are required.');
      return;
    }
    const shouldReschedule = outcomeValue === 'rescheduled' || outcomeValue === 'no_show';
    if (shouldReschedule && !outcomeRescheduleDate.trim()) {
      alert('Pick a new date and time to reschedule this same meeting.');
      return;
    }
    const lead = leads.find((row) => row.id === outcomeMeeting.leadId);
    if (!lead) {
      alert('Lead not found for this meeting.');
      return;
    }
    try {
      setOutcomeSaving(true);
      const followUps = (Array.isArray(lead.followUps) ? lead.followUps : []).map((followUp) => {
        if (followUp.id !== outcomeMeeting.id) return followUp;
        if (shouldReschedule) {
          const nextDate = new Date(outcomeRescheduleDate).toISOString();
          const rescheduleLine = `Rescheduled (${outcomeValue}): ${notesRequired}`;
          return {
            ...followUp,
            status: 'Planned' as const,
            date: nextDate,
            notes: [followUp.notes, rescheduleLine].filter(Boolean).join('\n'),
            updatedAt: new Date().toISOString(),
            updatedBy: currentUser || undefined,
          };
        }
        const outcomeLine = `Outcome: ${outcomeValue} — ${notesRequired}`;
        return {
          ...followUp,
          status: 'Done' as const,
          notes: [followUp.notes, outcomeLine].filter(Boolean).join('\n'),
          updatedAt: new Date().toISOString(),
          updatedBy: currentUser || undefined,
        };
      });
      await Promise.resolve(onUpdateLead({ ...lead, followUps }));
      cancelOutcomeMeeting();
    } catch (err: any) {
      alert(err?.message || 'Failed to save previous meeting outcome');
    } finally {
      setOutcomeSaving(false);
    }
  };

  const toggleThread = (key: string) => {
    setExpandedThreads((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const renderOutcomeForm = (meeting: MeetingItem) => {
    if (outcomeMeeting?.id !== meeting.id) return null;
    const needsReschedule = outcomeValue === 'rescheduled' || outcomeValue === 'no_show';
    return (
      <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50/50 p-3 space-y-3">
        <p className="text-sm font-semibold text-slate-800">
          Add previous meeting outcome
        </p>
        <div>
          <label className="block text-xs font-bold uppercase tracking-wide text-slate-500 mb-1">
            Outcome *
          </label>
          <select
            value={outcomeValue}
            onChange={(e) => setOutcomeValue((e.target.value as MeetingOutcomeValue | '') || '')}
            className="block w-full px-3 py-2 text-sm border-2 border-slate-300 rounded-lg bg-white min-h-[44px]"
          >
            <option value="">Select outcome</option>
            {OUTCOME_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </div>
        {needsReschedule && (
          <div>
            <label className="block text-xs font-bold uppercase tracking-wide text-slate-500 mb-1">
              New date & time *
            </label>
            <input
              type="datetime-local"
              value={outcomeRescheduleDate}
              onChange={(e) => setOutcomeRescheduleDate(e.target.value)}
              className="block w-full px-3 py-2 text-sm border-2 border-slate-300 rounded-lg bg-white min-h-[44px]"
            />
          </div>
        )}
        <div>
          <label className="block text-xs font-bold uppercase tracking-wide text-slate-500 mb-1">
            Outcome comments *
          </label>
          <textarea
            value={outcomeNotes}
            onChange={(e) => setOutcomeNotes(e.target.value)}
            rows={2}
            placeholder="Required: describe what happened in this previous meeting…"
            className="block w-full px-3 py-2 text-sm border-2 border-slate-300 rounded-lg bg-white"
          />
        </div>
        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <button
            type="button"
            onClick={cancelOutcomeMeeting}
            disabled={outcomeSaving}
            className="min-h-[44px] px-3 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={savePreviousOutcome}
            disabled={outcomeSaving}
            className="min-h-[44px] px-3 py-2 text-sm font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50"
          >
            {outcomeSaving ? 'Saving…' : 'Save outcome'}
          </button>
        </div>
      </div>
    );
  };

  const renderMeetingBody = (meeting: MeetingItem, options: { isPrimary: boolean; isPrevious: boolean }) => {
    const { isPrimary, isPrevious } = options;
    const showPlannedActions = meeting.status === 'Planned' && !meeting.isCheckIn && editingMeeting?.id !== meeting.id;
    return (
      <>
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-2">
          <div className="min-w-0">
            {isPrimary && (
              <p className="font-semibold text-slate-900 break-words">{meeting.agencyName}</p>
            )}
            {isPrevious && (
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-0.5">Previous meeting</p>
            )}
            <p className={`text-sm text-slate-600 ${isPrevious ? 'font-medium text-slate-800' : ''}`}>
              {new Date(meeting.date).toLocaleString([], {
                dateStyle: 'medium',
                timeStyle: 'short',
              })}
            </p>
            <p className="text-sm text-slate-500 mt-1 whitespace-pre-wrap">
              Notes: {meeting.notes || '—'}
            </p>
            <p className="text-xs text-slate-500 mt-1">
              Meeting created:{' '}
              <span className="font-medium text-slate-700">
                {meeting.createdAt
                  ? new Date(meeting.createdAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
                  : '—'}
              </span>
            </p>
            {meeting.backfilledByScript && (
              <p className="mt-1 inline-flex items-center rounded-md bg-slate-100 border border-slate-200 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                Backfilled by system script
                {Array.isArray(meeting.backfilledFields) && meeting.backfilledFields.length > 0
                  ? ` (${meeting.backfilledFields.join(', ')})`
                  : ''}
              </p>
            )}
          </div>
          <div className="text-left sm:text-right flex-shrink-0">
            <span className={`px-2 py-1 text-xs font-medium rounded-full ${meetingBadgeClass(meeting)}`}>
              {meetingBadgeLabel(meeting)}
            </span>
          </div>
        </div>

        {showPlannedActions && isPrimary && (
          <div className="mt-3 space-y-2">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 min-h-[44px]">
                <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Scheduled by</p>
                <p className="text-sm font-medium text-slate-800 truncate">{meeting.creatorLabel || '—'}</p>
              </div>
              <button
                type="button"
                onClick={() => meeting.meetingLink?.trim() && openMeetingLink(meeting.meetingLink)}
                disabled={!meeting.meetingLink?.trim()}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 min-h-[44px] text-left disabled:opacity-70"
                title={meeting.meetingLink || 'No meeting link'}
              >
                <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Meeting link</p>
                <p className="text-sm font-medium text-indigo-700 truncate">
                  {meeting.meetingLink?.trim() ? meetingLinkLabel(meeting.meetingLink) : 'No link added'}
                </p>
              </button>
              {(() => {
                const ownership = meetingStartOwnership(meeting);
                const activeHere = isActiveForThisLead(meeting);
                const blockedByOwner = !ownership.allowed && !activeHere;
                const blockedByActive = userInActiveMeeting && !activeHere;
                const disabled = blockedByOwner || blockedByActive;
                const title = blockedByOwner
                  ? (ownership.message || `Only ${ownership.ownerLabel || 'the scheduler'} can start this meeting`)
                  : blockedByActive
                    ? 'End your current meeting before starting another'
                    : undefined;
                const label = activeHere
                  ? 'End meeting'
                  : blockedByOwner
                    ? `Only ${ownership.ownerLabel || 'scheduler'} can start`
                    : blockedByActive
                      ? 'In another meeting'
                      : 'Start meeting';
                return (
                  <button
                    type="button"
                    onClick={() => startScheduledMeeting(meeting)}
                    disabled={disabled}
                    title={title}
                    className="rounded-lg min-h-[44px] px-3 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {label}
                  </button>
                );
              })()}
            </div>
            <div className="flex flex-col sm:flex-row gap-2 sm:justify-end">
              <button
                type="button"
                onClick={() => beginEditMeeting(meeting)}
                className="min-h-[44px] px-3 py-2 text-sm font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100"
              >
                Edit / Reschedule
              </button>
            </div>
          </div>
        )}

        {!meeting.isCheckIn && isPrevious && outcomeMeeting?.id !== meeting.id && (
          <div className="mt-3 flex flex-col sm:flex-row gap-2 sm:justify-end">
            <button
              type="button"
              onClick={() => beginOutcomeMeeting(meeting)}
              className="min-h-[44px] px-3 py-2 text-sm font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100"
            >
              {parseMeetingOutcome(meeting.notes || '') ? 'Update outcome' : 'Add previous meeting outcome'}
            </button>
          </div>
        )}

        {/* Allow outcome on a lone Done primary when viewing a day (no planned sibling) */}
        {!meeting.isCheckIn && isPrimary && meeting.status === 'Done' && outcomeMeeting?.id !== meeting.id && (
          <div className="mt-3 flex flex-col sm:flex-row gap-2 sm:justify-end">
            <button
              type="button"
              onClick={() => beginOutcomeMeeting(meeting)}
              className="min-h-[44px] px-3 py-2 text-sm font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100"
            >
              {parseMeetingOutcome(meeting.notes || '') ? 'Update outcome' : 'Add previous meeting outcome'}
            </button>
          </div>
        )}

        {editingMeeting?.id === meeting.id && (() => {
          const lead = leads.find((row) => row.id === meeting.leadId);
          const canFixMeta = canFixBlankMeetingMeta(lead, {
            currentUser,
            isAdmin,
            createdAt: meeting.createdAt,
          });
          return (
          <div className="mt-3 rounded-lg border border-indigo-200 bg-indigo-50/40 p-3 space-y-3">
            <p className="text-sm font-semibold text-slate-800">
              Edit / reschedule this same meeting (does not create a new calendar entry)
            </p>
            <div>
              <label className="block text-xs font-bold uppercase tracking-wide text-slate-500 mb-1">
                New date & time *
              </label>
              <input
                type="datetime-local"
                value={editDate}
                onChange={(e) => setEditDate(e.target.value)}
                className="block w-full px-3 py-2 text-sm border-2 border-slate-300 rounded-lg bg-white min-h-[44px]"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-wide text-slate-500 mb-1">
                Meeting link
              </label>
              <input
                type="url"
                value={editLink}
                onChange={(e) => setEditLink(e.target.value)}
                placeholder="https://zoom.us/j/… or meet.google.com/…"
                className="block w-full px-3 py-2 text-sm border-2 border-slate-300 rounded-lg bg-white min-h-[44px]"
              />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-wide text-slate-500 mb-1">
                Notes
              </label>
              <textarea
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                rows={2}
                className="block w-full px-3 py-2 text-sm border-2 border-slate-300 rounded-lg bg-white"
              />
            </div>
            {canFixMeta && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-lg border border-amber-200 bg-amber-50/70 p-3">
                <p className="sm:col-span-2 text-xs font-semibold text-amber-900">
                  Meeting created is blank. Fill these two fields (lead creator or admin only).
                </p>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wide text-slate-500 mb-1">
                    Meeting created *
                  </label>
                  <input
                    type="datetime-local"
                    value={editCreatedAt}
                    onChange={(e) => setEditCreatedAt(e.target.value)}
                    className="block w-full px-3 py-2 text-sm border-2 border-slate-300 rounded-lg bg-white min-h-[44px]"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wide text-slate-500 mb-1">
                    Account Manager / Scheduled by *
                  </label>
                  <select
                    value={editCreatedBy}
                    onChange={(e) => setEditCreatedBy(e.target.value)}
                    className="block w-full px-3 py-2 text-sm border-2 border-slate-300 rounded-lg bg-white min-h-[44px]"
                    required
                  >
                    <option value="">Select account manager</option>
                    {(Array.isArray(availableUsers) ? availableUsers : []).map((user) => (
                      <option key={user.email || user.id} value={user.email || ''}>
                        {user.name || user.email}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}
            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
              <button
                type="button"
                onClick={cancelEditMeeting}
                disabled={editSaving}
                className="min-h-[44px] px-3 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveEditMeeting}
                disabled={editSaving}
                className="min-h-[44px] px-3 py-2 text-sm font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50"
              >
                {editSaving ? 'Saving…' : 'Save reschedule'}
              </button>
            </div>
          </div>
          );
        })()}

        {renderOutcomeForm(meeting)}
      </>
    );
  };

  return (
    <div className="space-y-4 sm:space-y-8">
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3">
        <div>
          <h2 className="text-xl sm:text-3xl font-bold text-slate-800">Your Meetings</h2>
          <p className="text-sm text-slate-500 mt-0.5">Tap a date on the calendar to see that day’s agenda.</p>
        </div>
        <button
          onClick={onPlanNewMeeting}
          className="flex items-center justify-center gap-2 w-full sm:w-auto min-h-[44px] px-4 py-2.5 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700"
        >
          <PlusIcon className="h-4 w-4" /> Plan a New Meeting
        </button>
      </div>

      <Calendar
        meetings={visibleMeetings.filter((meeting) => {
          if (meeting.status === 'Done') return false;
          if (agentFilter && !namesMatch(meeting.agencyName, agentFilter)) return false;
          if (managerFilter && !emailsMatch(meeting.accountManager, managerFilter)) return false;
          if (cityFilter && (meeting.city || '').toLowerCase() !== cityFilter.toLowerCase()) return false;
          return true;
        })}
        selectedDate={selectedDate}
        onDateSelect={setSelectedDate}
      />

      <div>
        <div className="flex flex-col xl:flex-row xl:items-end xl:justify-between gap-3 mb-3 sm:mb-4">
          <h3 className="text-lg sm:text-xl font-bold text-slate-800">
            {selectedDate
              ? `Agenda for ${selectedDate.toLocaleDateString()}`
              : 'Upcoming Meetings'}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-2 w-full xl:max-w-5xl">
            <label className="block">
              <span className="block text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1">From date</span>
              <input
                type="date"
                value={dateFromFilter}
                onChange={(e) => setDateFromFilter(e.target.value)}
                disabled={Boolean(selectedDate)}
                className="block w-full px-3 py-2 text-sm border-2 border-slate-300 rounded-lg bg-white min-h-[44px] disabled:bg-slate-50"
              />
            </label>
            <label className="block">
              <span className="block text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1">To date</span>
              <input
                type="date"
                value={dateToFilter}
                onChange={(e) => setDateToFilter(e.target.value)}
                disabled={Boolean(selectedDate)}
                className="block w-full px-3 py-2 text-sm border-2 border-slate-300 rounded-lg bg-white min-h-[44px] disabled:bg-slate-50"
              />
            </label>
            <SearchableFilterSelect
              label="Agent"
              value={agentFilter}
              onChange={setAgentFilter}
              allLabel="All agents"
              placeholder="Search agents…"
              options={agentOptions.map((agent) => ({ value: agent, label: agent }))}
            />
            <SearchableFilterSelect
              label="Account manager"
              value={canViewAllMeetings ? managerFilter : (currentUser || '')}
              onChange={(next) => canViewAllMeetings && setManagerFilter(next)}
              allLabel="All account managers"
              placeholder="Search account managers…"
              disabled={!canViewAllMeetings}
              options={canViewAllMeetings ? managerOptions : [{
                value: currentUser || '',
                label: accountManagerName && accountManagerName !== 'N/A' ? accountManagerName : 'My meetings',
              }]}
            />
            <SearchableFilterSelect
              label="City"
              value={cityFilter}
              onChange={setCityFilter}
              allLabel="All cities"
              placeholder="Search cities…"
              options={cityOptions.map((city) => ({ value: city, label: city }))}
            />
          </div>
        </div>
        {meetingThreads.length > 0 ? (
          <ul className="space-y-4">
            {meetingThreads.map((thread) => {
              const isExpanded = Boolean(expandedThreads[thread.key]);
              const hasThread = thread.others.length > 0;
              // Agenda stays normal white — no selected-date color wash on this section.
              return (
                <li
                  key={thread.key}
                  className="p-3 sm:p-4 rounded-lg border border-slate-200 bg-white shadow-sm"
                >
                  {renderMeetingBody(thread.primary, { isPrimary: true, isPrevious: false })}

                  {hasThread && (
                    <div className="mt-3 -mx-3 sm:-mx-4 -mb-3 sm:-mb-4">
                      {isExpanded && (
                        <ul className="space-y-3 border-t border-indigo-100 bg-indigo-50 px-3 sm:px-4 py-3 border-l-4 border-l-indigo-400 ml-2 sm:ml-3">
                          {thread.others.map((meeting) => (
                            <li
                              key={meeting.id}
                              className="rounded-lg border border-indigo-200 bg-white p-3 shadow-sm ring-1 ring-indigo-100"
                            >
                              {renderMeetingBody(meeting, { isPrimary: false, isPrevious: true })}
                            </li>
                          ))}
                        </ul>
                      )}
                      <button
                        type="button"
                        onClick={() => toggleThread(thread.key)}
                        className="flex w-full items-center justify-center gap-2 min-h-[44px] px-4 py-2.5 text-sm font-semibold text-indigo-700 bg-indigo-50 border-t border-indigo-100 hover:bg-indigo-100 rounded-b-lg transition-colors"
                        aria-expanded={isExpanded}
                      >
                        <span className="inline-flex h-5 w-5 items-center justify-center rounded bg-indigo-600 text-white text-xs font-bold">
                          {isExpanded ? '−' : '+'}
                        </span>
                        {isExpanded
                          ? 'View less'
                          : `View more (+${thread.others.length} meeting${thread.others.length === 1 ? '' : 's'})`}
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="text-center py-8 sm:py-12 bg-white rounded-xl shadow-sm border border-slate-200 px-4">
            <h3 className="text-lg sm:text-xl font-semibold text-slate-700">No Meetings Scheduled</h3>
            <p className="text-slate-500 mt-2">
              {selectedDate
                ? 'There are no meetings on this date.'
                : 'Plan your first meeting from the button above.'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
