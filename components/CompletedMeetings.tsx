import React, { useState, useEffect, useMemo } from 'react';
import type { MeetingCheckInRecord, Lead, FollowUp } from '../types';
import { SearchableFilterSelect } from './SearchableFilterSelect';
import apiClient from '../services/apiClient';
import { readScheduledFollowUpId } from '../utils/scheduledMeeting';

interface CompletedMeetingsProps {
  meetingCheckIns: MeetingCheckInRecord[];
  leads: Lead[];
  currentUser: string | null;
  availableUsers: Array<{ id: string, name: string, email: string, role: string }>;
  /** Calendar date selected on Meetings page — highlight matching cards in open threads. */
  highlightDate?: Date | null;
  /** Shared Agent filter from agenda — filter completed meetings by client/agency name. */
  agentNameFilter?: string;
}

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

interface MeetingFilters {
  dateFrom: string;
  dateTo: string;
  user: string;
  leadId: string;
  meetingStatus: string;
  meetingOutcome: string;
  searchTerm: string;
}

const CompletedMeetings: React.FC<CompletedMeetingsProps> = ({
  meetingCheckIns,
  leads,
  currentUser,
  availableUsers,
  highlightDate = null,
  agentNameFilter = '',
}) => {
  const [filters, setFilters] = useState<MeetingFilters>({
    dateFrom: '',
    dateTo: '',
    user: '',
    leadId: '',
    meetingStatus: '',
    meetingOutcome: '',
    searchTerm: ''
  });

  const [showFilters, setShowFilters] = useState(false);
  const [selectedMeeting, setSelectedMeeting] = useState<MeetingCheckInRecord | null>(null);
  const [showPhotoModal, setShowPhotoModal] = useState(false);
  const [selectedPhotos, setSelectedPhotos] = useState<string[]>([]);
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);
  const [expandedThreads, setExpandedThreads] = useState<Record<string, boolean>>({});
  const [localOutcomes, setLocalOutcomes] = useState<Record<string, string>>({});
  const [outcomeEditKey, setOutcomeEditKey] = useState<string | null>(null);
  const [outcomeDraft, setOutcomeDraft] = useState('');
  const [outcomeSaving, setOutcomeSaving] = useState(false);

  // Filter and sort completed meetings
  const filteredMeetings = useMemo(() => {
    // 🟢 SAFE FIX: Ensure we have an array
    const safeCheckIns = Array.isArray(meetingCheckIns) ? meetingCheckIns : [];

    return safeCheckIns
      .filter(meeting => {
        // Show completed meetings - either has meetingStatus === 'completed' OR has checkOutTime (indicating meeting ended)
        const hasCheckOutTime = meeting.checkOutTime && meeting.checkOutTime.trim() !== '';
        const isCompleted = meeting.meetingStatus === 'completed' || hasCheckOutTime;
        if (!isCompleted) return false;

        // Date filtering
        if (filters.dateFrom) {
          const meetingDate = new Date(meeting.date);
          const fromDate = new Date(filters.dateFrom);
          fromDate.setHours(0, 0, 0, 0);
          if (!isNaN(meetingDate.getTime()) && meetingDate < fromDate) return false;
        }

        if (filters.dateTo) {
          const meetingDate = new Date(meeting.date);
          const toDate = new Date(filters.dateTo);
          toDate.setHours(23, 59, 59, 999);
          if (!isNaN(meetingDate.getTime()) && meetingDate > toDate) return false;
        }

        // User filtering
        if (filters.user && meeting.username !== filters.user) return false;

        // Shared agenda Agent (client) filter
        if (agentNameFilter) {
          const wanted = agentNameFilter.trim().toLowerCase();
          const leadName = String(meeting.leadName || '').trim().toLowerCase();
          const lead = (Array.isArray(leads) ? leads : []).find((row) => String(row.id) === String(meeting.leadId || ''));
          const agencyName = String(lead?.agencyName || '').trim().toLowerCase();
          if (leadName !== wanted && agencyName !== wanted) return false;
        }

        // Lead filtering (id or name: fallback for check-ins without leadId)
        if (filters.leadId) {
          if (filters.leadId.startsWith('name:')) {
            const name = filters.leadId.slice(5).trim().toLowerCase();
            if (String(meeting.leadName || '').trim().toLowerCase() !== name) return false;
          } else if (String(meeting.leadId || '') !== filters.leadId) {
            return false;
          }
        }

        // Meeting status filtering
        if (filters.meetingStatus && meeting.meetingStatus !== filters.meetingStatus) return false;

        // Meeting outcome filtering (include locally corrected + notes-inferred outcomes)
        if (filters.meetingOutcome) {
          const key = String(meeting.id || meeting.firebase_id || `${meeting.leadId || ''}-${meeting.username}-${meeting.date}-${meeting.checkInTime}`);
          const local = localOutcomes[key];
          const notes = `${meeting.notes || ''} ${meeting.completionNotes || ''}`.toLowerCase();
          const inferred = local
            || meeting.meetingOutcome
            || (/reschedul/.test(notes) ? 'rescheduled'
              : /no[\s_-]?show/.test(notes) ? 'no_show'
                : /cancel/.test(notes) ? 'cancelled'
                  : /successful|success/.test(notes) ? 'successful' : '');
          if (inferred !== filters.meetingOutcome) return false;
        }

        // Search term filtering
        if (filters.searchTerm) {
          const searchTerm = filters.searchTerm.toLowerCase();
          const searchInNotes = (meeting.notes || '').toLowerCase().includes(searchTerm);
          const searchInLeadName = (meeting.leadName || '').toLowerCase().includes(searchTerm);
          const searchInSalesPerson = (meeting.salesPersonName || '').toLowerCase().includes(searchTerm);

          if (!searchInNotes && !searchInLeadName && !searchInSalesPerson) return false;
        }

        return true;
      })
      .sort((a, b) => {
        // Sort by most recent first
        // Priority: checkOutTime > checkInTime > date
        const getSortTime = (meeting: MeetingCheckInRecord): number => {
          // Prefer checkOutTime if it exists and is not empty
          if (meeting.checkOutTime && meeting.checkOutTime.trim() !== '') {
            const checkOutDate = new Date(meeting.checkOutTime);
            if (!isNaN(checkOutDate.getTime())) {
              return checkOutDate.getTime();
            }
          }
          // Fallback to checkInTime
          if (meeting.checkInTime) {
            const checkInDate = new Date(meeting.checkInTime);
            if (!isNaN(checkInDate.getTime())) {
              return checkInDate.getTime();
            }
          }
          // Fallback to date
          if (meeting.date) {
            const date = new Date(meeting.date);
            if (!isNaN(date.getTime())) {
              return date.getTime();
            }
          }
          return 0;
        };

        const timeA = getSortTime(a);
        const timeB = getSortTime(b);

        // Sort descending (most recent first)
        return timeB - timeA;
      });
  }, [meetingCheckIns, filters, localOutcomes, agentNameFilter, leads]);

  const getMeetingSortTime = (meeting: MeetingCheckInRecord): number => {
    if (meeting.checkOutTime && meeting.checkOutTime.trim() !== '') {
      const checkOutDate = new Date(meeting.checkOutTime);
      if (!isNaN(checkOutDate.getTime())) return checkOutDate.getTime();
    }
    if (meeting.checkInTime) {
      const checkInDate = new Date(meeting.checkInTime);
      if (!isNaN(checkInDate.getTime())) return checkInDate.getTime();
    }
    if (meeting.date) {
      const date = new Date(meeting.date);
      if (!isNaN(date.getTime())) return date.getTime();
    }
    return 0;
  };

  const meetingRowKey = (meeting: MeetingCheckInRecord): string => (
    `${meeting.leadId || ''}-${meeting.username}-${meeting.date}-${meeting.checkInTime}`
  );

  const meetingThreads = useMemo(() => {
    const normalizeName = (value?: string) => String(value || 'Unknown Lead').trim().toLowerCase();

    // Prefer leadId; if some rows only have a name, map that name to a known leadId first.
    const nameToLeadId = new Map<string, string>();
    filteredMeetings.forEach((meeting) => {
      const leadId = String(meeting.leadId || '').trim();
      const name = normalizeName(meeting.leadName);
      if (leadId && name) nameToLeadId.set(name, leadId);
    });

    const groups = new Map<string, MeetingCheckInRecord[]>();
    filteredMeetings.forEach((meeting) => {
      const name = normalizeName(meeting.leadName);
      const leadId = String(meeting.leadId || '').trim() || nameToLeadId.get(name) || '';
      const key = leadId ? `lead:${leadId}` : `name:${name}`;
      const list = groups.get(key) || [];
      list.push(meeting);
      groups.set(key, list);
    });

    return Array.from(groups.entries()).map(([key, items]) => {
      const sorted = [...items].sort((a, b) => getMeetingSortTime(b) - getMeetingSortTime(a));
      const unique = sorted.filter((item, index, arr) => (
        arr.findIndex((row) => meetingRowKey(row) === meetingRowKey(item)) === index
      ));
      return {
        key,
        primary: unique[0],
        others: unique.slice(1),
      };
    }).sort((a, b) => getMeetingSortTime(b.primary) - getMeetingSortTime(a.primary));
  }, [filteredMeetings]);

  const highlightDateKey = highlightDate ? localDateKey(highlightDate) : '';

  // Auto-open client threads that contain a meeting on the calendar-selected date
  useEffect(() => {
    if (!highlightDateKey) return;
    setExpandedThreads((prev) => {
      const next = { ...prev };
      let changed = false;
      meetingThreads.forEach((thread) => {
        const matchInOthers = thread.others.some((m) => localDateKey(m.date) === highlightDateKey);
        if (matchInOthers && !next[thread.key]) {
          next[thread.key] = true;
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [highlightDateKey, meetingThreads]);

  // Get unique values for filter dropdowns safely — include check-in-only names so none are missing
  const uniqueUsers = [...new Set((Array.isArray(meetingCheckIns) ? meetingCheckIns : []).map(m => m.username).filter(Boolean))];

  const uniqueLeadOptions = useMemo(() => {
    const byId = new Map<string, { value: string; label: string }>();
    const byName = new Map<string, { value: string; label: string }>();
    const safeLeads = Array.isArray(leads) ? leads : [];
    const safeCheckIns = Array.isArray(meetingCheckIns) ? meetingCheckIns : [];

    safeLeads.forEach((lead) => {
      if (!safeCheckIns.some((m) => String(m.leadId || '') === String(lead.id))) return;
      byId.set(String(lead.id), { value: String(lead.id), label: lead.agencyName || lead.id });
    });

    safeCheckIns.forEach((meeting) => {
      const leadId = String(meeting.leadId || '').trim();
      const name = String(meeting.leadName || '').trim();
      if (leadId && byId.has(leadId)) return;
      if (leadId && name) {
        byId.set(leadId, { value: leadId, label: name });
        return;
      }
      if (name) {
        const key = name.toLowerCase();
        if (!byName.has(key)) byName.set(key, { value: `name:${name}`, label: name });
      }
    });

    return [...byId.values(), ...byName.values()].sort((a, b) => a.label.localeCompare(b.label));
  }, [leads, meetingCheckIns]);

  const uniqueOutcomes = [...new Set((Array.isArray(meetingCheckIns) ? meetingCheckIns : []).map(m => m.meetingOutcome).filter(Boolean))];

  const clearFilters = () => {
    setFilters({
      dateFrom: '',
      dateTo: '',
      user: '',
      leadId: '',
      meetingStatus: '',
      meetingOutcome: '',
      searchTerm: ''
    });
  };

  const getUserDisplayName = (email: string): string => {
    if (!email) return 'N/A';

    // 🟢 SAFE FIX: Ensure availableUsers is an array
    const safeUsers = Array.isArray(availableUsers) ? availableUsers : [];

    const user = safeUsers.find(u => u.email && u.email.toLowerCase() === email.toLowerCase());
    if (user && user.name && user.name.trim()) {
      return user.name;
    }

    // Simple mapping for common emails to names
    const emailToNameMap: { [key: string]: string } = {
      'iapplyam2b2b@gmail.com': 'Nakul Kathota',
      'canamrakesh@gmail.com': 'Rakesh',
      'amit.iapply@gmail.com': 'Amit Kumar',
      'admin@iapply.com': 'Admin',
      'support@iapply.com': 'Support Team'
    };

    const mappedName = emailToNameMap[email.toLowerCase()];
    if (mappedName) return mappedName;

    const emailPrefix = email.split('@')[0];
    return emailPrefix.charAt(0).toUpperCase() + emailPrefix.slice(1);
  };

  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return 'Invalid Date';
      return date.toLocaleDateString('en-IN', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        timeZone: 'Asia/Kolkata'
      });
    } catch {
      return 'Invalid Date';
    }
  };

  const formatTime = (dateString: string) => {
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return '';
      return date.toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Asia/Kolkata',
        hour12: true
      });
    } catch {
      return '';
    }
  };

  const formatDuration = (minutes?: number | null) => {
    if (!minutes || minutes <= 0) return null;
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins ? `${hours}h ${mins}m` : `${hours}h`;
  };

  const shortPlace = (address?: string) => {
    if (!address) return '';
    const parts = address
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean)
      .filter((part, index, arr) => part.toLowerCase() !== arr[index - 1]?.toLowerCase())
      .filter((part) => !/^\d{4,6}$/.test(part) && !/^india$/i.test(part));
    if (parts.length <= 2) return parts.join(', ');
    return `${parts[0]}, ${parts[parts.length - 1]}`;
  };

  const getOutcomeColor = (outcome: string) => {
    if (!outcome) return 'bg-blue-100 text-blue-800';
    switch (outcome) {
      case 'successful': return 'bg-green-100 text-green-800';
      case 'rescheduled': return 'bg-yellow-100 text-yellow-800';
      case 'cancelled': return 'bg-red-100 text-red-800';
      case 'no_show': return 'bg-gray-100 text-gray-800';
      default: return 'bg-blue-100 text-blue-800';
    }
  };

  const meetingRecordKey = (meeting: MeetingCheckInRecord): string => (
    String(meeting.id || meeting.firebase_id || meetingRowKey(meeting))
  );

  const resolveOutcome = (meeting: MeetingCheckInRecord): string => {
    const key = meetingRecordKey(meeting);
    if (localOutcomes[key]) return localOutcomes[key];
    if (meeting.meetingOutcome) return meeting.meetingOutcome;
    const notes = `${meeting.notes || ''} ${meeting.completionNotes || ''}`.toLowerCase();
    if (/reschedul/.test(notes)) return 'rescheduled';
    if (/no[\s_-]?show/.test(notes)) return 'no_show';
    if (/cancel/.test(notes)) return 'cancelled';
    if (/successful|success/.test(notes)) return 'successful';
    return '';
  };

  const formatOutcomeLabel = (outcome: string) => (
    outcome ? outcome.charAt(0).toUpperCase() + outcome.slice(1).replace('_', ' ') : ''
  );

  const saveOutcomeUpdate = async (meeting: MeetingCheckInRecord) => {
    const meetingId = meeting.id || meeting.firebase_id;
    if (!meetingId) {
      alert('This meeting record has no id, so the outcome cannot be updated.');
      return;
    }
    if (!outcomeDraft) {
      alert('Select an outcome.');
      return;
    }
    try {
      setOutcomeSaving(true);
      await apiClient.put(`/meetings/update/${meetingId}`, { meetingOutcome: outcomeDraft });
      setLocalOutcomes((prev) => ({ ...prev, [meetingRecordKey(meeting)]: outcomeDraft }));
      setOutcomeEditKey(null);
      setOutcomeDraft('');
    } catch (err: any) {
      alert(err?.message || 'Failed to update meeting outcome');
    } finally {
      setOutcomeSaving(false);
    }
  };

  const openPhotoModal = (photos: string[], startIndex: number = 0) => {
    setSelectedPhotos(photos);
    setCurrentPhotoIndex(startIndex);
    setShowPhotoModal(true);
  };

  const closePhotoModal = () => {
    setShowPhotoModal(false);
    setSelectedPhotos([]);
    setCurrentPhotoIndex(0);
  };

  const nextPhoto = () => {
    if (selectedPhotos.length === 0) return;
    setCurrentPhotoIndex((prev) => (prev + 1) % selectedPhotos.length);
  };

  const prevPhoto = () => {
    if (selectedPhotos.length === 0) return;
    setCurrentPhotoIndex((prev) => (prev - 1 + selectedPhotos.length) % selectedPhotos.length);
  };

  const toggleThread = (key: string) => {
    setExpandedThreads((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const resolveLinkedFollowUp = (meeting: MeetingCheckInRecord): FollowUp | null => {
    const lead = (Array.isArray(leads) ? leads : []).find(
      (item) => String(item.id) === String(meeting.leadId || '')
    );
    if (!lead || !Array.isArray(lead.followUps)) return null;
    const markedId = readScheduledFollowUpId(meeting.notes);
    if (markedId) {
      const byId = lead.followUps.find((f) => String(f.id) === String(markedId));
      if (byId) return byId;
    }
    const meetingDay = localDateKey(meeting.date || meeting.checkInTime);
    const meetings = lead.followUps.filter((f) => String(f.type || '').toLowerCase() === 'meeting');
    const sameDay = meetings.find((f) => localDateKey(f.date) === meetingDay);
    return sameDay || null;
  };

  const renderMeetingCard = (
    meeting: MeetingCheckInRecord,
    options: { showClientName: boolean; isPrevious?: boolean } = { showClientName: true }
  ) => {
    const allPhotos = [...(meeting.checkInPhotos || []), ...(meeting.completionPhotos || [])];
    const endLocation = Array.isArray(meeting.completionPhotoMetadata)
      ? meeting.completionPhotoMetadata[0]?.location
      : undefined;
    const durationLabel = formatDuration(meeting.meetingDuration);
    const timeRange = `${formatTime(meeting.checkInTime)}${meeting.checkOutTime ? ` – ${formatTime(meeting.checkOutTime)}` : ' – Ongoing'}`;
    const endPlace =
      endLocation?.address
        ? shortPlace(endLocation.address)
        : endLocation?.latitude != null && endLocation?.longitude != null
          ? `${Number(endLocation.latitude).toFixed(5)}, ${Number(endLocation.longitude).toFixed(5)}`
          : meeting.checkOutTime
            ? 'Not available'
            : null;
    const linkedFollowUp = resolveLinkedFollowUp(meeting);
    const createdByRaw = linkedFollowUp?.createdBy || meeting.createdBy || '';
    const createdAtRaw = linkedFollowUp?.createdAt || meeting.createdAt || '';
    const backfilledByScript = Boolean(linkedFollowUp?.backfilledByScript);

    return (
      <div className={`flex gap-3 ${options.isPrevious ? '' : ''}`}>
        {allPhotos[0] ? (
          <button
            type="button"
            onClick={() => openPhotoModal(allPhotos, 0)}
            className="relative w-16 h-16 sm:w-[4.5rem] sm:h-[4.5rem] rounded-xl overflow-hidden border border-slate-200 shrink-0"
            aria-label={`Open ${allPhotos.length} photo${allPhotos.length === 1 ? '' : 's'}`}
          >
            <img src={allPhotos[0]} alt="" className="w-full h-full object-cover" />
            {allPhotos.length > 1 && (
              <span className="absolute bottom-1 right-1 rounded-md bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                +{allPhotos.length - 1}
              </span>
            )}
          </button>
        ) : null}

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              {options.isPrevious && (
                <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-0.5">
                  Previous meeting
                </p>
              )}
              {options.showClientName && (
                <h3 className="text-[15px] sm:text-base font-semibold text-slate-900 leading-snug">
                  {meeting.leadName || 'Unknown Lead'}
                </h3>
              )}
            </div>
            {resolveOutcome(meeting) && (
              <span className={`shrink-0 px-2 py-0.5 text-[11px] font-semibold rounded-full ${getOutcomeColor(resolveOutcome(meeting))}`}>
                {formatOutcomeLabel(resolveOutcome(meeting))}
              </span>
            )}
          </div>

          <p className="mt-1 text-sm font-medium text-slate-800">
            {formatDate(meeting.date)} · {timeRange}
          </p>
          <p className="mt-0.5 text-xs text-slate-500">
            {getUserDisplayName(meeting.username)}
            {durationLabel ? ` · ${durationLabel}` : ''}
          </p>
          {(createdByRaw || createdAtRaw) && (
            <p className="mt-0.5 text-xs text-slate-500">
              Created by {createdByRaw ? getUserDisplayName(createdByRaw) : '—'}
              {createdAtRaw
                ? ` · ${new Date(createdAtRaw).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}`
                : ''}
            </p>
          )}
          {backfilledByScript && (
            <p className="mt-1 inline-flex items-center rounded-md bg-slate-100 border border-slate-200 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
              Backfilled by system script
              {Array.isArray(linkedFollowUp?.backfilledFields) && linkedFollowUp.backfilledFields.length > 0
                ? ` (${linkedFollowUp.backfilledFields.join(', ')})`
                : ''}
            </p>
          )}

          {meeting.location?.address && (
            <a
              href={`https://www.google.com/maps?q=${meeting.location.latitude},${meeting.location.longitude}`}
              target="_blank"
              rel="noopener noreferrer"
              title={meeting.location.address}
              className="mt-2 flex items-center gap-1.5 text-sm text-indigo-700 hover:text-indigo-900 min-w-0"
            >
              <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span className="truncate">{shortPlace(meeting.location.address)}</span>
            </a>
          )}

          {endPlace && (
            <p className="mt-0.5 pl-5 text-xs text-slate-500 truncate" title={endLocation?.address || endPlace}>
              End: {endPlace}
            </p>
          )}

          {meeting.notes && (
            <p className="mt-2 text-sm text-slate-700 line-clamp-2">
              {meeting.notes}
            </p>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {allPhotos.length > 0 && (
              <button
                type="button"
                onClick={() => openPhotoModal(allPhotos)}
                className="flex items-center gap-1 px-3 py-1.5 text-sm text-blue-600 bg-blue-50 border border-blue-200 rounded-md hover:bg-blue-100"
              >
                📸 Photos ({allPhotos.length})
              </button>
            )}
            <button
              type="button"
              onClick={() => setSelectedMeeting(meeting)}
              className="flex items-center gap-1 px-3 py-1.5 text-sm text-indigo-600 bg-indigo-50 border border-indigo-200 rounded-md hover:bg-indigo-100"
            >
              👁️ View Details
            </button>
            <button
              type="button"
              onClick={() => {
                setOutcomeEditKey(meetingRecordKey(meeting));
                setOutcomeDraft(resolveOutcome(meeting) || '');
              }}
              className="flex items-center gap-1 px-3 py-1.5 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md hover:bg-emerald-100"
            >
              {resolveOutcome(meeting) ? 'Fix outcome' : 'Add outcome'}
            </button>
          </div>

          {outcomeEditKey === meetingRecordKey(meeting) && (
            <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50/60 p-3 space-y-2">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                Set correct meeting outcome
              </p>
              <select
                value={outcomeDraft}
                onChange={(e) => setOutcomeDraft(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md bg-white min-h-[40px]"
              >
                <option value="">Select outcome</option>
                <option value="successful">Successful</option>
                <option value="rescheduled">Rescheduled</option>
                <option value="cancelled">Cancelled</option>
                <option value="no_show">No Show</option>
                <option value="other">Other</option>
              </select>
              <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
                <button
                  type="button"
                  disabled={outcomeSaving}
                  onClick={() => { setOutcomeEditKey(null); setOutcomeDraft(''); }}
                  className="min-h-[40px] px-3 py-1.5 text-sm text-slate-700 bg-white border border-slate-300 rounded-md"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={outcomeSaving}
                  onClick={() => void saveOutcomeUpdate(meeting)}
                  className="min-h-[40px] px-3 py-1.5 text-sm font-semibold text-white bg-emerald-600 rounded-md disabled:opacity-50"
                >
                  {outcomeSaving ? 'Saving…' : 'Save outcome'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-slate-800">Completed Meetings</h2>
          <p className="text-sm text-slate-600 mt-1">
            Photos, remarks, and outcomes from finished meetings
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full font-semibold text-sm">
            Total: {(Array.isArray(meetingCheckIns) ? meetingCheckIns : []).filter(m => {
              const hasCheckOutTime = m.checkOutTime && m.checkOutTime.trim() !== '';
              return m.meetingStatus === 'completed' || hasCheckOutTime;
            }).length}
          </span>
          {filteredMeetings.length !== (Array.isArray(meetingCheckIns) ? meetingCheckIns : []).filter(m => {
            const hasCheckOutTime = m.checkOutTime && m.checkOutTime.trim() !== '';
            return m.meetingStatus === 'completed' || hasCheckOutTime;
          }).length && (
              <span className="px-3 py-1 bg-orange-100 text-orange-800 rounded-full font-semibold text-sm">
                Filtered: {filteredMeetings.length}
              </span>
            )}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="app-icon-btn flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 min-h-[44px]"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.207A1 1 0 013 6.5V4z" />
            </svg>
            Filters
          </button>
        </div>
      </div>

      {/* Filters */}
      {showFilters && (
        <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {/* Date From */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Date From</label>
              <input
                type="date"
                value={filters.dateFrom}
                onChange={(e) => setFilters(prev => ({ ...prev, dateFrom: e.target.value }))}
                className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>

            {/* Date To */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Date To</label>
              <input
                type="date"
                value={filters.dateTo}
                onChange={(e) => setFilters(prev => ({ ...prev, dateTo: e.target.value }))}
                className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>

            <SearchableFilterSelect
              label="User"
              value={filters.user}
              onChange={(user) => setFilters((prev) => ({ ...prev, user }))}
              allLabel="All Users"
              placeholder="Search users…"
              options={uniqueUsers.map((user) => ({
                value: user,
                label: getUserDisplayName(user),
              }))}
            />

            <SearchableFilterSelect
              label="Lead"
              value={filters.leadId}
              onChange={(leadId) => setFilters((prev) => ({ ...prev, leadId }))}
              allLabel="All Leads"
              placeholder="Search leads / agents…"
              options={uniqueLeadOptions}
            />

            <SearchableFilterSelect
              label="Outcome"
              value={filters.meetingOutcome}
              onChange={(meetingOutcome) => setFilters((prev) => ({ ...prev, meetingOutcome }))}
              allLabel="All Outcomes"
              placeholder="Search outcomes…"
              options={uniqueOutcomes.map((outcome) => ({
                value: outcome,
                label: formatOutcomeLabel(outcome),
              }))}
            />

            {/* Search */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Search</label>
              <input
                type="text"
                placeholder="Search in notes, lead name, sales person..."
                value={filters.searchTerm}
                onChange={(e) => setFilters(prev => ({ ...prev, searchTerm: e.target.value }))}
                className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
          </div>

          {/* Filter Actions */}
          <div className="mt-4 flex gap-2">
            <button
              onClick={clearFilters}
              className="px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 rounded-md hover:bg-slate-200"
            >
              Clear All
            </button>
          </div>
        </div>
      )}

      {/* Meetings List — one card per client; expand for prior meetings */}
      <div className="space-y-4">
        {meetingThreads.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-lg p-12 text-center">
            <div className="mx-auto w-24 h-24 bg-slate-100 rounded-full flex items-center justify-center mb-4">
              <svg className="h-12 w-12 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-slate-900 mb-2">No completed meetings found</h3>
            <p className="text-slate-500">Try adjusting your filters or check back later for new meetings.</p>
          </div>
        ) : (
          meetingThreads.map((thread) => {
            const isExpanded = Boolean(expandedThreads[thread.key]);
            const hasThread = thread.others.length > 0;
            const primaryIsSelectedDay = Boolean(
              highlightDateKey && localDateKey(thread.primary.date) === highlightDateKey
            );
            return (
              <div
                key={thread.key}
                className={`rounded-xl p-4 shadow-sm transition-shadow bg-white border border-slate-200 hover:shadow-md hover:border-indigo-200 ${
                  primaryIsSelectedDay ? 'border-l-4 border-l-amber-200 bg-[#FFFEF8]' : ''
                }`}
              >
                {primaryIsSelectedDay && (
                  <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-amber-600/70">
                    Selected date
                  </p>
                )}
                {renderMeetingCard(thread.primary, { showClientName: true })}

                {hasThread && (
                  <div className="mt-3 -mx-4 -mb-4">
                    {isExpanded && (
                      <ul className="space-y-3 border-t border-indigo-100 bg-indigo-50 px-4 py-3 border-l-4 border-l-indigo-400 ml-2 sm:ml-3">
                        {thread.others.map((meeting) => {
                          const isSelectedDay = Boolean(
                            highlightDateKey && localDateKey(meeting.date) === highlightDateKey
                          );
                          return (
                            <li
                              key={meetingRowKey(meeting)}
                              className={`rounded-lg p-3 shadow-sm ${
                                isSelectedDay
                                  ? 'border border-amber-100 border-l-4 border-l-amber-200 bg-[#FFFEF8]'
                                  : 'border border-indigo-200 bg-white ring-1 ring-indigo-100'
                              }`}
                            >
                              {isSelectedDay && (
                                <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-amber-600/70">
                                  Selected date
                                </p>
                              )}
                              {renderMeetingCard(meeting, { showClientName: false, isPrevious: true })}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                    <button
                      type="button"
                      onClick={() => toggleThread(thread.key)}
                      className="flex w-full items-center justify-center gap-2 min-h-[44px] px-4 py-2.5 text-sm font-semibold text-indigo-700 bg-indigo-50 border-t border-indigo-100 hover:bg-indigo-100 rounded-b-xl transition-colors"
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
              </div>
            );
          })
        )}
      </div>

      {/* Meeting Details Modal */}
      {selectedMeeting && (
        <div
          className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-[80] p-0 sm:p-4"
          onClick={() => setSelectedMeeting(null)}
        >
          <div
            className="bg-white rounded-t-2xl sm:rounded-xl max-w-lg w-full max-h-[92dvh] overflow-y-auto shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 z-10 flex items-start justify-between gap-3 px-4 py-3.5 sm:px-5 border-b border-slate-200 bg-white pt-[max(0.75rem,env(safe-area-inset-top))]">
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Meeting Details</p>
                <h3 className="mt-0.5 text-[17px] sm:text-lg font-semibold text-slate-900 leading-snug break-words">
                  {selectedMeeting.leadName || 'Unknown Lead'}
                </h3>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {selectedMeeting.meetingStatus && (
                    <span className="lead-chip bg-sky-50 text-sky-800 border-sky-200">
                      {String(selectedMeeting.meetingStatus).charAt(0).toUpperCase() + String(selectedMeeting.meetingStatus).slice(1)}
                    </span>
                  )}
                  {resolveOutcome(selectedMeeting) && (
                    <span className={`lead-chip ${getOutcomeColor(resolveOutcome(selectedMeeting))}`}>
                      {formatOutcomeLabel(resolveOutcome(selectedMeeting))}
                    </span>
                  )}
                </div>
              </div>
              <button
                onClick={() => setSelectedMeeting(null)}
                className="app-icon-btn p-2 min-h-[44px] min-w-[44px] text-slate-400 hover:text-slate-600 flex-shrink-0"
                aria-label="Close details"
              >
                <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-4 sm:p-5 space-y-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
              <section className="rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-1">
                <div className="meeting-detail-row">
                  <div className="meeting-detail-label">User</div>
                  <div className="meeting-detail-value font-medium">{getUserDisplayName(selectedMeeting.username)}</div>
                </div>
                <div className="meeting-detail-row">
                  <div className="meeting-detail-label">Date</div>
                  <div className="meeting-detail-value">{formatDate(selectedMeeting.date)}</div>
                </div>
                <div className="meeting-detail-row">
                  <div className="meeting-detail-label">Time</div>
                  <div className="meeting-detail-value">
                    {formatTime(selectedMeeting.checkInTime)}
                    {selectedMeeting.checkOutTime ? ` – ${formatTime(selectedMeeting.checkOutTime)}` : ' – Ongoing'}
                  </div>
                </div>
                <div className="meeting-detail-row">
                  <div className="meeting-detail-label">Duration</div>
                  <div className="meeting-detail-value font-medium">
                    {formatDuration(selectedMeeting.meetingDuration) || 'N/A'}
                  </div>
                </div>
                {selectedMeeting.meetingType && (
                  <div className="meeting-detail-row">
                    <div className="meeting-detail-label">Type</div>
                    <div className="meeting-detail-value">{selectedMeeting.meetingType}</div>
                  </div>
                )}
              </section>

              {(selectedMeeting.location || selectedMeeting.checkOutTime) && (
                <section className="space-y-2">
                  {selectedMeeting.location?.address && (
                    <div className="meeting-info-panel meeting-info-panel--ok">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700 mb-1.5">Start Location</p>
                      <p className="text-[13px] leading-snug text-emerald-900 break-words">{selectedMeeting.location.address}</p>
                      {selectedMeeting.location.latitude != null && selectedMeeting.location.longitude != null && (
                        <a
                          href={`https://www.google.com/maps?q=${selectedMeeting.location.latitude},${selectedMeeting.location.longitude}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex mt-2.5 min-h-[36px] items-center text-xs font-semibold text-indigo-700 underline"
                        >
                          Open in Maps
                        </a>
                      )}
                    </div>
                  )}
                  {(() => {
                    const endLoc = Array.isArray(selectedMeeting.completionPhotoMetadata)
                      ? selectedMeeting.completionPhotoMetadata[0]?.location
                      : undefined;
                    if (endLoc?.address || (endLoc?.latitude != null && endLoc?.longitude != null)) {
                      return (
                        <div className="meeting-info-panel meeting-info-panel--ok">
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700 mb-1.5">End Location</p>
                          <p className="text-[13px] leading-snug text-emerald-900 break-words">
                            {endLoc.address ||
                              `${Number(endLoc.latitude).toFixed(6)}, ${Number(endLoc.longitude).toFixed(6)}`}
                          </p>
                          {endLoc.latitude != null && endLoc.longitude != null && (
                            <a
                              href={`https://www.google.com/maps?q=${endLoc.latitude},${endLoc.longitude}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex mt-2.5 min-h-[36px] items-center text-xs font-semibold text-indigo-700 underline"
                            >
                              Open in Maps
                            </a>
                          )}
                        </div>
                      );
                    }
                    if (selectedMeeting.checkOutTime) {
                      return (
                        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3">
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-1">End Location</p>
                          <p className="text-[13px] text-slate-500">Not available</p>
                        </div>
                      );
                    }
                    return null;
                  })()}
                </section>
              )}

              {selectedMeeting.notes && (
                <section>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-1.5">Notes</p>
                  <p className="rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-[13px] leading-relaxed text-slate-800 whitespace-pre-wrap break-words">
                    {selectedMeeting.notes}
                  </p>
                </section>
              )}

              {((selectedMeeting.checkInPhotos || []).length > 0 || (selectedMeeting.completionPhotos || []).length > 0) && (
                <section>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-2">Photos</p>
                  {(selectedMeeting.checkInPhotos || []).length > 0 && (
                    <div className="mb-3">
                      <p className="text-xs font-medium text-slate-500 mb-1.5">Check-in</p>
                      <div className="grid grid-cols-3 gap-2">
                        {(selectedMeeting.checkInPhotos || []).map((photo, index) => (
                          <button
                            type="button"
                            key={`checkin-${index}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              const allPhotos = [...(selectedMeeting.checkInPhotos || []), ...(selectedMeeting.completionPhotos || [])];
                              openPhotoModal(allPhotos, index);
                            }}
                            className="aspect-square rounded-lg overflow-hidden border border-slate-200 hover:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400"
                          >
                            <img src={photo} alt={`Check-in photo ${index + 1}`} className="w-full h-full object-cover" />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {(selectedMeeting.completionPhotos || []).length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-slate-500 mb-1.5">Completion</p>
                      <div className="grid grid-cols-3 gap-2">
                        {(selectedMeeting.completionPhotos || []).map((photo, index) => (
                          <button
                            type="button"
                            key={`completion-${index}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              const allPhotos = [...(selectedMeeting.checkInPhotos || []), ...(selectedMeeting.completionPhotos || [])];
                              openPhotoModal(allPhotos, (selectedMeeting.checkInPhotos?.length || 0) + index);
                            }}
                            className="aspect-square rounded-lg overflow-hidden border border-slate-200 hover:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400"
                          >
                            <img src={photo} alt={`Completion photo ${index + 1}`} className="w-full h-full object-cover" />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </section>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Photo Modal */}
      {showPhotoModal && (
        <div
          className="fixed inset-0 bg-black/85 flex items-center justify-center z-[100] p-3"
          onClick={closePhotoModal}
          role="dialog"
          aria-modal="true"
          aria-label="Photo preview"
        >
          <div
            className="relative max-w-4xl max-h-[90dvh] w-full h-full flex items-center justify-center"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={closePhotoModal}
              className="absolute top-2 right-2 sm:top-4 sm:right-4 z-10 min-h-[44px] min-w-[44px] rounded-full bg-black/50 text-white hover:bg-black/70 flex items-center justify-center"
              aria-label="Close photo"
            >
              <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            {selectedPhotos.length > 0 && (
              <>
                <img
                  src={selectedPhotos[currentPhotoIndex]}
                  alt={`Photo ${currentPhotoIndex + 1}`}
                  className="max-w-full max-h-[80dvh] object-contain rounded-lg"
                />

                {selectedPhotos.length > 1 && (
                  <>
                    <button
                      type="button"
                      onClick={prevPhoto}
                      className="absolute left-1 sm:left-4 top-1/2 -translate-y-1/2 min-h-[44px] min-w-[44px] rounded-full bg-black/50 text-white hover:bg-black/70 flex items-center justify-center"
                      aria-label="Previous photo"
                    >
                      <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                      </svg>
                    </button>

                    <button
                      type="button"
                      onClick={nextPhoto}
                      className="absolute right-1 sm:right-4 top-1/2 -translate-y-1/2 min-h-[44px] min-w-[44px] rounded-full bg-black/50 text-white hover:bg-black/70 flex items-center justify-center"
                      aria-label="Next photo"
                    >
                      <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </button>

                    <div className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 text-white text-sm">
                      {currentPhotoIndex + 1} of {selectedPhotos.length}
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default CompletedMeetings;