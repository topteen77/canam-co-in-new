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

export const ItineraryDisplay: React.FC<MeetingPlannerProps> = ({
  leads,
  meetingCheckInRecords = [],
  availableUsers = [],
  currentUser = null,
  canViewAllMeetings = false,
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
    const matched = visibleMeetings.filter((meeting) => {
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
    return matched;
  }, [visibleMeetings, agentFilter, managerFilter, cityFilter, selectedDate]);

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
        {filteredMeetings.length > 0 ? (
          <ul className="space-y-4">
            {filteredMeetings.map((meeting) => (
              <li
                key={meeting.id}
                className="p-3 sm:p-4 bg-white rounded-lg border border-slate-200 shadow-sm"
              >
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900 break-words">{meeting.agencyName}</p>
                    <p className="text-sm text-slate-600">
                      {new Date(meeting.date).toLocaleString([], {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      })}
                    </p>
                    <p className="text-sm text-slate-500 mt-1">
                      Notes: {meeting.notes || '—'}
                    </p>
                  </div>
                  <div className="text-left sm:text-right flex-shrink-0">
                    <span
                      className={`px-2 py-1 text-xs font-medium rounded-full ${
                        meeting.status === 'Done'
                          ? 'bg-green-100 text-green-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {meeting.status}
                    </span>
                  </div>
                </div>

                {meeting.status === 'Planned' && !meeting.isCheckIn && (
                  <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2">
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
                )}
              </li>
            ))}
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
