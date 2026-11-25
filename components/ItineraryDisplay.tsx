import React, { useMemo, useState } from 'react';
import type { Lead, FollowUp, MeetingCheckInRecord } from '../types';
import { PlusIcon } from './icons/SparklesIcon';
import { getUserDisplayName } from '../utils/dataCleaning';
import { emailsMatch } from '../utils/leadPermissions';
import { isActiveMeetingRecord, meetingBelongsToUser } from '../utils/meetingActive';
import { stripScheduledFollowUpId, type ScheduledMeetingStart } from '../utils/scheduledMeeting';

type MeetingItem = FollowUp & {
  leadId: string;
  agencyName: string;
  isCheckIn?: boolean;
  creatorLabel?: string;
  accountManager?: string;
  salesPerson?: string;
  city?: string;
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
  canViewAllMeetings?: boolean;
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

function meetingBadgeLabel(meeting: MeetingItem): string {
  const outcome = parseMeetingOutcome(meeting.notes || '');
  if (outcome) return outcomeLabel(outcome);
  return meeting.status;
}

function meetingBadgeClass(meeting: MeetingItem): string {
  const outcome = parseMeetingOutcome(meeting.notes || '');
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
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)))
    .sort((a, b) => a.localeCompare(b));
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
        .map((m) => {
          try {
            const d = new Date(m.date);
            return isNaN(d.getTime()) ? null : d.toDateString();
          } catch {
            return null;
          }
        })
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
          const isToday = day.toDateString() === new Date().toDateString();
          const hasMeeting = meetingDays.has(day.toDateString());
          const isSelected = selectedDate?.toDateString() === day.toDateString();
          return (
            <button
              key={day.toISOString()}
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
  canViewAllMeetings = false,
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
          const creatorRaw = r.createdBy || r.salesPersonEmail || r.username || r.salesPersonName || '';
          const linkedLead = leads.find((lead) => String(lead.id) === String(r.leadId || ''));
          return {
            id,
            type: 'Meeting' as const,
            status,
            date: dateStr,
            notes: stripScheduledFollowUpId(r.notes || ''),
            meetingLink: (r as { meetingLink?: string }).meetingLink || '',
            createdBy: creatorRaw,
            leadId: r.leadId || '',
            agencyName: r.leadName || linkedLead?.agencyName || '—',
            isCheckIn: true,
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

  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [agentFilter, setAgentFilter] = useState('');
  const [managerFilter, setManagerFilter] = useState('');
  const [cityFilter, setCityFilter] = useState('');
  const [editingMeeting, setEditingMeeting] = useState<MeetingItem | null>(null);
  const [editDate, setEditDate] = useState('');
  const [editLink, setEditLink] = useState('');
  const [editNotes, setEditNotes] = useState('');
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

  const agentOptions = useMemo(
    () => uniqueSorted(visibleMeetings.map((meeting) => meeting.agencyName)),
    [visibleMeetings]
  );
  const managerOptions = useMemo(
    () => uniqueSorted(visibleMeetings.map((meeting) => meeting.accountManager || '')).map((email) => ({
      email,
      label: getUserDisplayName(email, availableUsers),
    })),
    [visibleMeetings, availableUsers]
  );
  const cityOptions = useMemo(
    () => uniqueSorted(visibleMeetings.map((meeting) => meeting.city || '')),
    [visibleMeetings]
  );

  const filteredMeetings = useMemo(() => {
    return visibleMeetings.filter((meeting) => {
      // Upcoming list: only open meetings. Selected day: include Done so prior slots show in the client thread.
      if (!selectedDate && meeting.status === 'Done') return false;
      if (agentFilter && meeting.agencyName !== agentFilter) return false;
      if (managerFilter && !emailsMatch(meeting.accountManager, managerFilter)) return false;
      if (cityFilter && (meeting.city || '').toLowerCase() !== cityFilter.toLowerCase()) return false;
      if (!selectedDate) {
        const today = new Date(new Date().toDateString()).getTime();
        const time = new Date(meeting.date).getTime();
        return !isNaN(time) && time >= today;
      }
      return new Date(meeting.date).toDateString() === selectedDate.toDateString();
    });
  }, [visibleMeetings, agentFilter, managerFilter, cityFilter, selectedDate]);

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

  const accountManagerName = currentUser
    ? getUserDisplayName(currentUser, availableUsers)
    : '';

  const startScheduledMeeting = (meeting: MeetingItem) => {
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
    setEditingMeeting(meeting);
    setEditDate(toLocalDateTimeValue(meeting.date));
    setEditLink(meeting.meetingLink || '');
    setEditNotes(meeting.notes || '');
  };

  const cancelEditMeeting = () => {
    setEditingMeeting(null);
    setEditDate('');
    setEditLink('');
    setEditNotes('');
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
    try {
      setEditSaving(true);
      const nextDate = new Date(editDate).toISOString();
      const followUps = (Array.isArray(lead.followUps) ? lead.followUps : []).map((followUp) => {
        if (followUp.id !== editingMeeting.id) return followUp;
        return {
          ...followUp,
          status: 'Planned' as const,
          date: nextDate,
          meetingLink: editLink.trim() || undefined,
          notes: editNotes.trim(),
          updatedAt: new Date().toISOString(),
          updatedBy: currentUser || undefined,
        };
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
              <button
                type="button"
                onClick={() => startScheduledMeeting(meeting)}
                className="rounded-lg min-h-[44px] px-3 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700"
              >
                {meetingCheckInRecords.some((record) => (
                  String(record.leadId || '') === String(meeting.leadId)
                  && meetingBelongsToUser(record, currentUser)
                  && isActiveMeetingRecord(record)
                )) ? 'End meeting' : 'Start meeting'}
              </button>
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

        {editingMeeting?.id === meeting.id && (
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
        )}

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
          if (agentFilter && meeting.agencyName !== agentFilter) return false;
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
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 w-full xl:max-w-3xl">
            <label className="block">
              <span className="block text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1">Agent</span>
              <select
                value={agentFilter}
                onChange={(e) => setAgentFilter(e.target.value)}
                className="block w-full px-3 py-2 text-sm border-2 border-slate-300 rounded-lg bg-white min-h-[44px]"
              >
                <option value="">All agents</option>
                {agentOptions.map((agent) => <option key={agent} value={agent}>{agent}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="block text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1">Account manager</span>
              <select
                value={canViewAllMeetings ? managerFilter : (currentUser || '')}
                onChange={(e) => canViewAllMeetings && setManagerFilter(e.target.value)}
                disabled={!canViewAllMeetings}
                className="block w-full px-3 py-2 text-sm border-2 border-slate-300 rounded-lg bg-white min-h-[44px] disabled:bg-slate-50"
              >
                {canViewAllMeetings && <option value="">All account managers</option>}
                {(canViewAllMeetings ? managerOptions : [{
                  email: currentUser || '',
                  label: accountManagerName && accountManagerName !== 'N/A' ? accountManagerName : 'My meetings',
                }]).map((manager) => (
                  <option key={manager.email || 'me'} value={manager.email}>{manager.label}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="block text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1">City</span>
              <select
                value={cityFilter}
                onChange={(e) => setCityFilter(e.target.value)}
                className="block w-full px-3 py-2 text-sm border-2 border-slate-300 rounded-lg bg-white min-h-[44px]"
              >
                <option value="">All cities</option>
                {cityOptions.map((city) => <option key={city} value={city}>{city}</option>)}
              </select>
            </label>
          </div>
        </div>
        {meetingThreads.length > 0 ? (
          <ul className="space-y-4">
            {meetingThreads.map((thread) => {
              const isExpanded = Boolean(expandedThreads[thread.key]);
              const hasThread = thread.others.length > 0;
              return (
                <li
                  key={thread.key}
                  className="p-3 sm:p-4 bg-white rounded-lg border border-slate-200 shadow-sm"
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
