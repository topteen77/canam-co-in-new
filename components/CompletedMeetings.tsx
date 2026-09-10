import React, { useState, useEffect, useMemo } from 'react';
import type { MeetingCheckInRecord, Lead } from '../types';

interface CompletedMeetingsProps {
  meetingCheckIns: MeetingCheckInRecord[];
  leads: Lead[];
  currentUser: string | null;
  availableUsers: Array<{ id: string, name: string, email: string, role: string }>;
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
  availableUsers
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

        // Lead filtering
        if (filters.leadId && meeting.leadId !== filters.leadId) return false;

        // Meeting status filtering
        if (filters.meetingStatus && meeting.meetingStatus !== filters.meetingStatus) return false;

        // Meeting outcome filtering
        if (filters.meetingOutcome && meeting.meetingOutcome !== filters.meetingOutcome) return false;

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
  }, [meetingCheckIns, filters]);

  // Get unique values for filter dropdowns safely
  const uniqueUsers = [...new Set((Array.isArray(meetingCheckIns) ? meetingCheckIns : []).map(m => m.username))];

  const uniqueLeads = (Array.isArray(leads) ? leads : []).filter(lead =>
    (Array.isArray(meetingCheckIns) ? meetingCheckIns : []).some(m => m.leadId === lead.id)
  );

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

            {/* User */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">User</label>
              <select
                value={filters.user}
                onChange={(e) => setFilters(prev => ({ ...prev, user: e.target.value }))}
                className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
              >
                <option value="">All Users</option>
                {uniqueUsers.map(user => (
                  <option key={user} value={user}>
                    {getUserDisplayName(user)}
                  </option>
                ))}
              </select>
            </div>

            {/* Lead */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Lead</label>
              <select
                value={filters.leadId}
                onChange={(e) => setFilters(prev => ({ ...prev, leadId: e.target.value }))}
                className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
              >
                <option value="">All Leads</option>
                {uniqueLeads.map(lead => (
                  <option key={lead.id} value={lead.id}>
                    {lead.agencyName}
                  </option>
                ))}
              </select>
            </div>

            {/* Meeting Outcome */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Outcome</label>
              <select
                value={filters.meetingOutcome}
                onChange={(e) => setFilters(prev => ({ ...prev, meetingOutcome: e.target.value }))}
                className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
              >
                <option value="">All Outcomes</option>
                {uniqueOutcomes.map(outcome => (
                  <option key={outcome} value={outcome}>
                    {outcome.charAt(0).toUpperCase() + outcome.slice(1).replace('_', ' ')}
                  </option>
                ))}
              </select>
            </div>

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

      {/* Meetings List */}
      <div className="space-y-4">
        {filteredMeetings.length === 0 ? (
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
          filteredMeetings.map((meeting) => {
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

            return (
            <div
              key={`${meeting.username}-${meeting.date}-${meeting.checkInTime}`}
              className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm hover:shadow-md hover:border-indigo-200 transition-shadow"
            >
              <div className="flex gap-3">
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
                    <h3 className="text-[15px] sm:text-base font-semibold text-slate-900 leading-snug">
                      {meeting.leadName || 'Unknown Lead'}
                    </h3>
                    {meeting.meetingOutcome && (
                      <span className={`shrink-0 px-2 py-0.5 text-[11px] font-semibold rounded-full ${getOutcomeColor(meeting.meetingOutcome)}`}>
                        {meeting.meetingOutcome.charAt(0).toUpperCase() + meeting.meetingOutcome.slice(1).replace('_', ' ')}
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
                  </div>
                </div>
              </div>
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
                  {selectedMeeting.meetingOutcome && (
                    <span className={`lead-chip ${getOutcomeColor(selectedMeeting.meetingOutcome)}`}>
                      {selectedMeeting.meetingOutcome.charAt(0).toUpperCase() + selectedMeeting.meetingOutcome.slice(1).replace('_', ' ')}
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