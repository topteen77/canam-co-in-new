import React, { useMemo, useState, useEffect } from 'react';
import { Modal } from './Modal';
import apiClient from '../services/apiClient';
import type { Lead } from '../types';
import { EnhancedPhotoUpload } from './EnhancedPhotoUpload';
import { isActiveMeetingRecord, meetingBelongsToUser } from '../utils/meetingActive';
import {
  readScheduledFollowUpId,
  withScheduledFollowUpId,
  type ScheduledMeetingStart,
} from '../utils/scheduledMeeting';
import { evaluateCheckInIdentity } from '../shared/meetingCheckInIdentity.js';
import { getUserDisplayName } from '../utils/dataCleaning';

interface SimpleMeetingCheckInProps {
  isOpen: boolean;
  onClose: () => void;
  availableUsers: Array<{ id: string, name: string, email: string, role: string }>;
  userLeads: Lead[];
  currentUser: string;
  isAdmin?: boolean;
  onLogout?: () => void | Promise<void>;
  /** Refresh parent meeting list so header "In Meeting" stays in sync. */
  onMeetingsChange?: () => void | Promise<void>;
  /** Prefill check-in when an account manager starts a scheduled agenda meeting. */
  scheduledMeeting?: ScheduledMeetingStart | null;
  /** Called after a scheduled meeting is checked out with an outcome. */
  onScheduledMeetingCompleted?: (result: {
    followUpId: string;
    leadId: string;
    outcome: string;
    outcomeNotes: string;
    rescheduleDate?: string;
  }) => void | Promise<void>;
}

export const SimpleMeetingCheckIn: React.FC<SimpleMeetingCheckInProps> = ({
  isOpen,
  onClose,
  availableUsers,
  userLeads,
  currentUser,
  isAdmin = false,
  onLogout,
  onMeetingsChange,
  scheduledMeeting = null,
  onScheduledMeetingCompleted,
}) => {
  const [selectedSalesPerson, setSelectedSalesPerson] = useState('');
  const [personMeetingName, setPersonMeetingName] = useState('');
  const [meetingType, setMeetingType] = useState('Portal Training meeting');
  const [selectedLead, setSelectedLead] = useState('');
  const [uploadedPhotoSize, setUploadedPhotoSize] = useState<string>('');
  const [meetingNotes, setMeetingNotes] = useState('');
  const [location, setLocation] = useState<{ latitude: number, longitude: number, address: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGettingLocation, setIsGettingLocation] = useState(false);
  const [activeMeeting, setActiveMeeting] = useState<any>(null);
  const [meetingOutcome, setMeetingOutcome] = useState('');
  const [completionNotes, setCompletionNotes] = useState('');
  const [rescheduleDate, setRescheduleDate] = useState('');

  // Photo upload states
  const [checkInPhotos, setCheckInPhotos] = useState<string[]>([]);
  const [completionPhotos, setCompletionPhotos] = useState<string[]>([]);
  const [photoUploadError, setPhotoUploadError] = useState('');

  // Lead search states
  const [leadSearchTerm, setLeadSearchTerm] = useState('');
  const [showLeadDropdown, setShowLeadDropdown] = useState(false);
  const [showIdentityPrompt, setShowIdentityPrompt] = useState(false);

  // 🟢 SAFE FIX: Ensure userLeads is an array
  const safeUserLeads = Array.isArray(userLeads) ? userLeads : [];

  // Filter leads based on search term
  const filteredLeads = safeUserLeads.filter(lead =>
    (lead.agencyName || '').toLowerCase().includes(leadSearchTerm.toLowerCase()) ||
    (lead.status || '').toLowerCase().includes(leadSearchTerm.toLowerCase()) ||
    (lead.contacts && lead.contacts[0]?.city?.toLowerCase().includes(leadSearchTerm.toLowerCase()))
  );

  // Get selected lead data for display
  const selectedLeadData = safeUserLeads.find(lead => lead.id === selectedLead);
  const signedInLabel = getUserDisplayName(currentUser, availableUsers);
  const identityCheck = useMemo(
    () =>
      evaluateCheckInIdentity({
        currentUserEmail: currentUser,
        currentUserName: signedInLabel,
        salesPersonName: selectedSalesPerson,
        accountManager: selectedLeadData?.accountManager || '',
        users: availableUsers,
      }),
    [currentUser, signedInLabel, selectedSalesPerson, selectedLeadData?.accountManager, availableUsers]
  );
  const identityMismatch = !identityCheck.match;

  // Photo upload handlers - append photos instead of replacing
  const handleCheckInPhotoUpload = (photos: string[], fileSize?: string) => {
    console.log('📸 Check-in photos uploaded:', photos.length);
    setCheckInPhotos(prev => [...prev, ...photos]);
    setPhotoUploadError('');
    if (fileSize) {
      setUploadedPhotoSize(fileSize);
    }
  };

  const handleCompletionPhotoUpload = (photos: string[], fileSize?: string) => {
    console.log('📸 Completion photos uploaded:', photos.length);
    setCompletionPhotos(prev => [...prev, ...photos]);
    setPhotoUploadError('');
  };

  // Remove individual photos
  const removeCheckInPhoto = (index: number) => {
    setCheckInPhotos(prev => prev.filter((_, i) => i !== index));
  };

  const removeCompletionPhoto = (index: number) => {
    setCompletionPhotos(prev => prev.filter((_, i) => i !== index));
  };

  const handlePhotoUploadError = (error: string) => {
    console.error('❌ Photo upload error:', error);
    setPhotoUploadError(error);
  };

  // Check for active meeting
  useEffect(() => {
    if (isOpen && currentUser) {
      void (async () => {
        await checkActiveMeeting();
        // Keep header blink state aligned with live API data.
        await onMeetingsChange?.();
      })();
    }
    if (!isOpen) setShowIdentityPrompt(false);
  }, [isOpen, currentUser, onMeetingsChange]);

  useEffect(() => {
    if (!isOpen || !scheduledMeeting) return;
    setSelectedLead(scheduledMeeting.leadId);
    setLeadSearchTerm('');
    setSelectedSalesPerson(scheduledMeeting.accountManagerName || '');
    setMeetingNotes(scheduledMeeting.notes || '');
    setMeetingType('Follow-up Meeting');
  }, [isOpen, scheduledMeeting]);

  const checkActiveMeeting = async () => {
    try {
      console.log('🔍 Checking for active meeting...');
      const { data: rows } = await apiClient.get('/meetings/all');
      const list = Array.isArray(rows) ? rows : [];
      const active = list.find(
        (r: any) => meetingBelongsToUser(r, currentUser) && isActiveMeetingRecord(r)
      );
      if (active) {
        const id = active.id ?? active.firebase_id;
        setActiveMeeting({ id, ...active });
        console.log('✅ Active meeting found:', active);
      } else {
        setActiveMeeting(null);
        console.log('ℹ️ No active meeting found');
      }
    } catch (error) {
      console.error('❌ Error checking active meeting:', error);
    }
  };

  const getCurrentLocation = async () => {
    setIsGettingLocation(true);
    try {
      console.log('🌍 Starting precise location capture...');

      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        if (!navigator.geolocation) {
          reject(new Error("Geolocation is not supported by this browser."));
          return;
        }
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true, // Enable high accuracy for precise location
          timeout: 45000, // Increased timeout for better accuracy
          maximumAge: 0 // Don't use cached location
        });
      });

      const { latitude, longitude, accuracy } = position.coords;
      console.log('📍 GPS coordinates:', { latitude, longitude, accuracy });

      // Get detailed address using multiple geocoding services
      const detailedAddress = await getDetailedAddressFromCoords(latitude, longitude);

      setLocation({ latitude, longitude, address: detailedAddress });
      console.log('✅ Precise location captured:', { latitude, longitude, address: detailedAddress });
    } catch (error) {
      console.error('❌ Location error:', error);
      // Set default location with fallback
      setLocation({
        latitude: 30.7410,
        longitude: 76.7818,
        address: 'Chandigarh, India (Default Location - GPS unavailable)'
      });
      alert("Could not get precise location. Using default/approximate location.");
    } finally {
      setIsGettingLocation(false);
    }
  };

  const getDetailedAddressFromCoords = async (lat: number, lng: number): Promise<string> => {
    try {
      const GOOGLE_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "YOUR_API_KEY";

      if (GOOGLE_API_KEY && GOOGLE_API_KEY !== "YOUR_API_KEY") {
        const response = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${GOOGLE_API_KEY}`);
        const data = await response.json();
        if (data.status === "OK" && data.results && data.results.length > 0) {
          return data.results[0].formatted_address;
        }
      }

      // Fallback to OpenStreetMap if Google API fails or is not configured
      const osmResponse = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`);
      const osmData = await osmResponse.json();
      if (osmData && osmData.display_name) {
        return osmData.display_name;
      }

      return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
    } catch (e) {
      return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
    }
  };

  // 🟢 SAFE FIX: Included simplified version of geocoding logic for completeness
  // In a real codebase, import this from a utility service
  const getAddressFromBigDataCloud = async (lat: number, lng: number): Promise<string> => {
    // Stub
    return `${lat}, ${lng}`;
  };

  const resolveLeadName = (leadIdValue: string) => {
    const fromList = safeUserLeads.find(
      (lead) => String(lead.id) === String(leadIdValue)
    );
    return (
      String(fromList?.agencyName || '').trim()
      || String(scheduledMeeting?.leadName || '').trim()
      || ''
    );
  };

  const submitStartMeeting = async (confirmIdentityOverride = false) => {
    if (!location) {
      alert('Please wait for location to be captured or try again');
      return;
    }

    // Soft client guard: do not start a second active meeting
    try {
      const { data: rows } = await apiClient.get('/meetings/all');
      const list = Array.isArray(rows) ? rows : [];
      const alreadyActive = list.find(
        (r: any) => meetingBelongsToUser(r, currentUser) && isActiveMeetingRecord(r)
      );
      if (alreadyActive) {
        alert('You already have a meeting in progress. End that meeting before starting another.');
        await checkActiveMeeting();
        return;
      }
    } catch {
      // continue; server also guards
    }

    const leadIdValue = String(selectedLead || scheduledMeeting?.leadId || '').trim();
    const leadNameValue = resolveLeadName(leadIdValue);
    if (!leadIdValue || !leadNameValue) {
      alert('Please select a client / lead before starting the meeting.');
      return;
    }

    setIsSubmitting(true);
    setShowIdentityPrompt(false);
    try {
      console.log('🚀 Starting meeting...');

      const now = new Date();
      const optimizedPhotos = checkInPhotos;

      const meetingData = {
        username: currentUser,
        salesPersonName: selectedSalesPerson,
        salesPersonEmail: personMeetingName || '',
        meetingType: meetingType,
        notes: scheduledMeeting?.followUpId
          ? withScheduledFollowUpId(meetingNotes, scheduledMeeting.followUpId)
          : meetingNotes,
        leadId: leadIdValue,
        leadName: leadNameValue,
        date: now.toISOString().split('T')[0],
        checkInTime: now.toISOString(),
        meetingStatus: 'active',
        location: {
          latitude: location.latitude,
          longitude: location.longitude,
          address: location.address
        },
        checkInPhotos: optimizedPhotos,
        photoUploadCount: {
          checkIn: optimizedPhotos.length,
          completion: 0
        },
        createdBy: currentUser,
        createdAt: now.toISOString(),
        ...(confirmIdentityOverride ? { confirmIdentityOverride: true } : {}),
      };

      console.log('📝 Meeting data:', meetingData);

      await apiClient.post('/meetings/check-in', meetingData);

      console.log('✅ Meeting started successfully');
      alert('Meeting started successfully!');

      setSelectedSalesPerson('');
      setPersonMeetingName('');
      setMeetingNotes('');
      setSelectedLead('');
      setCheckInPhotos([]);
      setUploadedPhotoSize('');

      await checkActiveMeeting();
      await onMeetingsChange?.();
    } catch (error: any) {
      console.error('❌ Error starting meeting:', error);

      const apiData = error?.response?.data;
      let errorMessage = 'Unknown error';
      if (apiData?.error === 'IDENTITY_MISMATCH' || apiData?.code === 'IDENTITY_MISMATCH') {
        setShowIdentityPrompt(true);
        return;
      } else if (apiData?.error === 'NOT_MEETING_OWNER') {
        errorMessage = apiData.message
          || `Only ${apiData.ownerLabel || 'the scheduler'} can start this meeting.`;
      } else if (apiData?.error === 'ACTIVE_MEETING_EXISTS') {
        errorMessage = apiData.message || 'You already have a meeting in progress.';
        await checkActiveMeeting();
      } else if (apiData?.error === 'LEAD_REQUIRED') {
        errorMessage = apiData.message || 'Please select a client / lead before starting.';
      } else if (error.message?.includes('bytes')) {
        errorMessage = 'Photos are too large. Please try with fewer or smaller photos.';
      } else if (error.message?.includes('permission') || error?.response?.status === 401) {
        errorMessage = 'Permission denied. Please sign in again.';
      } else if (error.message?.includes('network')) {
        errorMessage = 'Network error. Please check your internet connection.';
      } else {
        errorMessage = apiData?.message || error.message || 'Unknown error';
      }

      alert(`Error starting meeting: ${errorMessage}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStartMeeting = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedSalesPerson.trim()) {
      alert('Please enter account manager name');
      return;
    }

    if (!selectedLead) {
      alert('Please select a lead');
      return;
    }

    if (!location) {
      alert('Please wait for location to be captured or try again');
      return;
    }

    if (checkInPhotos.length === 0) {
      setPhotoUploadError('Please upload at least one meeting start photo before starting the meeting');
      return;
    }

    // Popup only when Account Manager / lead AM does not match signed-in user
    if (identityMismatch) {
      setShowIdentityPrompt(true);
      return;
    }

    await submitStartMeeting(false);
  };

  const handleIdentityLogout = async () => {
    setShowIdentityPrompt(false);
    onClose();
    if (onLogout) {
      await onLogout();
      return;
    }
    window.location.reload();
  };

  const scheduledFollowUpId = readScheduledFollowUpId(activeMeeting?.notes)
    || (
      scheduledMeeting
      && String(activeMeeting?.leadId || '') === String(scheduledMeeting.leadId)
        ? scheduledMeeting.followUpId
        : ''
    );
  const needsRescheduleSlot = meetingOutcome === 'rescheduled' || meetingOutcome === 'no_show';
  const outcomeCommentsMissing = !meetingOutcome || !completionNotes.trim();
  const rescheduleSlotMissing = needsRescheduleSlot && !String(rescheduleDate || '').trim();
  const cannotCompleteMeeting = outcomeCommentsMissing || rescheduleSlotMissing;

  useEffect(() => {
    if (!needsRescheduleSlot) setRescheduleDate('');
  }, [needsRescheduleSlot]);

  const handleEndMeeting = async () => {
    if (!activeMeeting) return;
    if (outcomeCommentsMissing) {
      alert('Outcome and outcome comments are required before a meeting can be marked completed.');
      return;
    }
    if (rescheduleSlotMissing) {
      alert('Choose a new date and time to reschedule this same meeting (do not create a new calendar entry).');
      return;
    }

    console.log('🔄 Ending meeting...');
    console.log('📊 Active meeting data:', activeMeeting);
    setIsSubmitting(true);

    try {
      const now = new Date();
      let startTime: Date;
      let durationMinutes: number;

      // Handle invalid or missing start time
      if (activeMeeting.checkInTime) {
        startTime = new Date(activeMeeting.checkInTime);

        // Check if the date is valid
        if (isNaN(startTime.getTime())) {
          console.warn('⚠️ Invalid start time detected, using current time as fallback');
          startTime = now;
          durationMinutes = 0; // Set to 0 for invalid start time
        } else {
          durationMinutes = Math.round((now.getTime() - startTime.getTime()) / (1000 * 60));
        }
      } else {
        console.warn('⚠️ No start time found, using current time as fallback');
        startTime = now;
        durationMinutes = 0;
      }

      // Ensure duration is not negative
      if (durationMinutes < 0) {
        durationMinutes = 0;
      }

      const updateData = {
        checkOutTime: now.toISOString(),
        meetingDuration: durationMinutes,
        meetingStatus: 'completed',
        meetingOutcome: meetingOutcome,
        completionNotes: completionNotes,
        // Photo upload fields for completion
        completionPhotos: completionPhotos,
        photoUploadCount: {
          checkIn: activeMeeting.checkInPhotos?.length || 0,
          completion: completionPhotos.length
        },
        // Fix the invalid start time if it was invalid
        checkInTime: startTime.toISOString(),
        // Preserve lead information if it exists
        leadId: activeMeeting.leadId || null,
        leadName: activeMeeting.leadName || null
      };

      console.log('📝 Update data:', updateData);

      await apiClient.put(`/meetings/update/${activeMeeting.id}`, updateData);

      console.log('✅ Meeting ended successfully');
      if (scheduledFollowUpId) {
        await onScheduledMeetingCompleted?.({
          followUpId: scheduledFollowUpId,
          leadId: String(activeMeeting.leadId || scheduledMeeting?.leadId || ''),
          outcome: meetingOutcome,
          outcomeNotes: completionNotes.trim(),
          rescheduleDate: needsRescheduleSlot
            ? new Date(rescheduleDate).toISOString()
            : undefined,
        });
      }
      alert(
        needsRescheduleSlot
          ? `Meeting marked as ${meetingOutcome.replace('_', ' ')}. The same calendar meeting was moved to the new time.`
          : `Meeting ended successfully! Duration: ${durationMinutes} minutes`
      );

      setActiveMeeting(null);
      setMeetingOutcome('');
      setCompletionNotes('');
      setRescheduleDate('');
      await onMeetingsChange?.();

    } catch (error: any) {
      console.error('❌ Error ending meeting:', error);
      alert(`Error ending meeting: ${error.message || 'Unknown error'}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const formatStartTime = (value?: string) => {
    try {
      if (!value) return '—';
      const startTime = new Date(value);
      if (isNaN(startTime.getTime())) return 'Invalid date';
      return startTime.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour12: true });
    } catch {
      return 'Invalid date';
    }
  };

  return (
    <Modal
      title={activeMeeting ? 'Meeting Check-out' : 'Meeting Check-in'}
      onClose={onClose}
      fullScreenOnMobile
      maxWidth="max-w-lg"
    >
      {activeMeeting ? (
        <div className="space-y-4">
          <div className="meeting-info-panel">
            <div className="flex items-center justify-between gap-2 mb-3">
              <p className="text-[13px] font-semibold uppercase tracking-wide text-orange-700">In progress</p>
              <span className="lead-chip bg-orange-100 text-orange-800 border-orange-200">Active</span>
            </div>
            <dl className="space-y-2">
              <div className="flex items-baseline gap-2">
                <dt className="lead-fact-label">Type</dt>
                <dd className="min-w-0 text-[13px] font-semibold text-slate-900 break-words">{activeMeeting.meetingType || '—'}</dd>
              </div>
              <div className="flex items-baseline gap-2">
                <dt className="lead-fact-label">AM</dt>
                <dd className="min-w-0 text-[13px] text-slate-800 break-words">{activeMeeting.salesPersonName || '—'}</dd>
              </div>
              <div className="flex items-baseline gap-2">
                <dt className="lead-fact-label">Client</dt>
                <dd className="min-w-0 text-[13px] text-slate-800 break-words">
                  {activeMeeting.leadName
                    || scheduledMeeting?.leadName
                    || resolveLeadName(String(activeMeeting.leadId || scheduledMeeting?.leadId || ''))
                    || '—'}
                </dd>
              </div>
              <div className="flex items-baseline gap-2">
                <dt className="lead-fact-label">Started</dt>
                <dd className="min-w-0 text-[13px] text-slate-700">{formatStartTime(activeMeeting.checkInTime)}</dd>
              </div>
            </dl>
          </div>

          <div className="meeting-field">
            <label htmlFor="meeting-outcome">
              Meeting Outcome *
            </label>
            <select
              id="meeting-outcome"
              value={meetingOutcome}
              onChange={(e) => setMeetingOutcome(e.target.value)}
              required
            >
              <option value="">Select outcome</option>
              <option value="successful">Successful</option>
              <option value="rescheduled">Rescheduled (same meeting)</option>
              <option value="cancelled">Cancelled</option>
              <option value="no_show">No Show / agent not joining (reschedule same)</option>
              <option value="other">Other</option>
            </select>
            {!meetingOutcome && (
              <p className="mt-1 text-xs font-medium text-rose-700">Select an outcome before completing.</p>
            )}
          </div>

          {needsRescheduleSlot && (
            <div className="meeting-field">
              <label htmlFor="reschedule-date">New date & time for this same meeting *</label>
              <input
                id="reschedule-date"
                type="datetime-local"
                value={rescheduleDate}
                onChange={(e) => setRescheduleDate(e.target.value)}
                min={new Date().toISOString().slice(0, 16)}
                required
              />
              <p className="mt-1 text-xs text-slate-500 normal-case tracking-normal font-normal">
                Updates the existing calendar entry — does not create a new meeting.
              </p>
            </div>
          )}

          <div className="meeting-field">
            <label htmlFor="completion-notes">
              Outcome comments *
            </label>
            <textarea
              id="completion-notes"
              value={completionNotes}
              onChange={(e) => setCompletionNotes(e.target.value)}
              rows={3}
              required
              placeholder="Required: describe the outcome before completing this meeting…"
            />
            {!completionNotes.trim() && (
              <p className="mt-1 text-xs font-medium text-rose-700">Outcome comments are mandatory.</p>
            )}
          </div>

          <div className="meeting-field">
            <label>End Photos (optional)</label>
            <div className="meeting-photo-box">
              <EnhancedPhotoUpload
                onUploadComplete={handleCompletionPhotoUpload}
                onUploadError={handlePhotoUploadError}
                disabled={isSubmitting}
                maxFileSize={50}
                compressionQuality={0.7}
                showCameraInGallery={true}
              />
            </div>

            {photoUploadError && (
              <p className="mt-2 text-sm text-rose-600">{photoUploadError}</p>
            )}

            {completionPhotos.length > 0 && (
              <div className="mt-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-emerald-700">
                    {completionPhotos.length} photo{completionPhotos.length !== 1 ? 's' : ''} added
                  </span>
                  <button
                    type="button"
                    onClick={() => setCompletionPhotos([])}
                    className="text-xs text-rose-600 hover:text-rose-800 underline"
                  >
                    Clear all
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {completionPhotos.map((photo, index) => (
                    <div key={index} className="relative">
                      <img
                        src={photo}
                        alt={`Completion photo ${index + 1}`}
                        className="w-full h-20 object-cover rounded-lg border border-slate-200"
                      />
                      <button
                        type="button"
                        onClick={() => removeCompletionPhoto(index)}
                        className="absolute top-1 right-1 bg-rose-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs"
                        title="Remove photo"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-col-reverse sm:flex-row gap-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
            <button
              type="button"
              onClick={onClose}
              className="w-full sm:w-auto min-h-[44px] px-4 py-2 text-sm font-semibold text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleEndMeeting}
              disabled={isSubmitting || cannotCompleteMeeting}
              className="w-full flex-1 min-h-[44px] px-4 py-2 text-sm font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50"
            >
              {isSubmitting
                ? 'Saving meeting and photos…'
                : needsRescheduleSlot
                  ? 'Save & Reschedule Same Meeting'
                  : 'Complete Meeting'}
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleStartMeeting} className="space-y-4 relative">
          {showIdentityPrompt && (
            <div className="absolute inset-0 z-30 flex items-start justify-center rounded-lg bg-slate-900/40 p-3 sm:p-4">
              <div
                role="alertdialog"
                aria-modal="true"
                aria-labelledby="meeting-identity-title"
                className="w-full max-w-md rounded-xl border border-amber-200 bg-white p-4 shadow-xl"
              >
                <h3 id="meeting-identity-title" className="text-base font-semibold text-slate-900">
                  Account mismatch
                </h3>
                <p className="mt-2 text-sm text-slate-700 leading-snug">
                  You are signed in as <strong>{signedInLabel}</strong>
                  {currentUser ? ` (${currentUser})` : ''}, but Account Manager is{' '}
                  <strong>{identityCheck.conflictingLabel || selectedSalesPerson || 'someone else'}</strong>.
                </p>
                <p className="mt-2 text-sm text-slate-600">
                  Log out and sign in with the correct account, or start anyway (saved under your current login).
                </p>
                <div className="mt-4 flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={() => void handleIdentityLogout()}
                    className="min-h-[44px] rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700"
                  >
                    Log out
                  </button>
                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => void submitStartMeeting(true)}
                    className="min-h-[44px] rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {isSubmitting ? 'Starting…' : 'Start anyway'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowIdentityPrompt(false)}
                    className="min-h-[44px] rounded-lg bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-200"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-[13px] text-slate-800">
            <p className="font-semibold">
              Checking in as: {signedInLabel}
              {currentUser ? (
                <span className="font-normal text-slate-600"> ({currentUser})</span>
              ) : null}
            </p>
          </div>

          <div className="meeting-field">
            <label htmlFor="salesPerson">Account Manager *</label>
            <input
              type="text"
              id="salesPerson"
              value={selectedSalesPerson}
              onChange={(e) => setSelectedSalesPerson(e.target.value)}
              placeholder="Enter account manager name..."
              required
            />
          </div>

          <div className="meeting-field">
            <label htmlFor="personMeeting">Person Meeting</label>
            <input
              type="text"
              id="personMeeting"
              value={personMeetingName}
              onChange={(e) => setPersonMeetingName(e.target.value)}
              placeholder="e.g., John Doe - Director"
            />
          </div>

          <div className="meeting-field">
            <label htmlFor="meetingType">Meeting Type</label>
            <select
              id="meetingType"
              value={meetingType}
              onChange={(e) => setMeetingType(e.target.value)}
            >
              <option value="Portal Training meeting">Portal Training meeting</option>
              <option value="Portal demo meeting">Portal demo meeting</option>
              <option value="Fresh walking - 1st meeting">Fresh walking - 1st meeting</option>
              <option value="Agent Review meeting">Agent Review meeting</option>
              <option value="Follow-up Meeting">Follow-up Meeting</option>
              <option value="Demo">Demo</option>
              <option value="Product training & Ielts ,University">Product training & Ielts ,University</option>
            </select>
          </div>

          <div className="meeting-field">
            <label htmlFor="lead">{scheduledMeeting ? 'Lead *' : 'Select Lead *'}</label>
            {scheduledMeeting ? (
              <div
                id="lead"
                className="meeting-info-panel text-[14px] font-semibold text-slate-900 break-words"
              >
                {String(
                  scheduledMeeting.leadName
                  || selectedLeadData?.agencyName
                  || resolveLeadName(String(scheduledMeeting.leadId || selectedLead || ''))
                  || ''
                ).trim() || '—'}
              </div>
            ) : (
              <>
                <div className="relative">
                  <input
                    type="text"
                    id="lead"
                    value={selectedLead ? `${selectedLeadData?.agencyName || ''} - ${selectedLeadData?.status || ''}` : leadSearchTerm}
                    onChange={(e) => {
                      setLeadSearchTerm(e.target.value);
                      setSelectedLead('');
                      setShowLeadDropdown(true);
                    }}
                    onFocus={() => setShowLeadDropdown(true)}
                    onBlur={() => {
                      setTimeout(() => setShowLeadDropdown(false), 200);
                    }}
                    placeholder="Search and select a lead..."
                    required
                  />
                  {showLeadDropdown && (
                    <div className="absolute z-20 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-56 overflow-y-auto">
                      {filteredLeads.length > 0 ? (
                        filteredLeads.map((lead) => (
                          <button
                            type="button"
                            key={lead.id}
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => {
                              setSelectedLead(lead.id);
                              setLeadSearchTerm('');
                              setShowLeadDropdown(false);
                              if (lead.accountManager) {
                                setSelectedSalesPerson(lead.accountManager);
                              }
                            }}
                            className="w-full text-left px-3 py-2.5 hover:bg-slate-50 border-b border-slate-100 last:border-b-0"
                          >
                            <div className="font-medium text-slate-900 text-sm break-words">{lead.agencyName}</div>
                            <div className="text-xs text-slate-500 mt-0.5">
                              {lead.contacts?.[0]?.city ? (
                                <span className="text-sky-700 font-medium">{lead.contacts[0].city}</span>
                              ) : null}
                              <span className={lead.contacts?.[0]?.city ? ' ml-2' : ''}>Status: {lead.status}</span>
                            </div>
                          </button>
                        ))
                      ) : (
                        <div className="px-3 py-2 text-slate-500 text-sm">
                          {leadSearchTerm ? 'No leads found' : 'No leads available'}
                        </div>
                      )}
                    </div>
                  )}
                </div>
                {selectedLead && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedLead('');
                      setLeadSearchTerm('');
                    }}
                    className="mt-1.5 text-xs text-slate-500 hover:text-slate-700 underline"
                  >
                    Clear selected lead
                  </button>
                )}
              </>
            )}
          </div>

          <div className="meeting-field">
            <label>Current Location *</label>
            {isGettingLocation ? (
              <div className="meeting-info-panel text-[13px] text-sky-800">Getting precise location…</div>
            ) : location ? (
              <div className="meeting-info-panel meeting-info-panel--ok space-y-2">
                <p className="text-[13px] font-semibold text-emerald-800">Location captured</p>
                <p className="text-[13px] text-emerald-900 break-words">{location.address}</p>
                <p className="text-[11px] text-emerald-700 tabular-nums">
                  {location.latitude.toFixed(6)}, {location.longitude.toFixed(6)}
                </p>
                <button
                  type="button"
                  onClick={getCurrentLocation}
                  className="text-xs font-medium text-indigo-700 hover:text-indigo-900 underline"
                >
                  Update location
                </button>
              </div>
            ) : (
              <div className="meeting-info-panel meeting-info-panel--warn space-y-2">
                <p className="text-[13px] text-rose-700">Precise location is required to start</p>
                <button
                  type="button"
                  onClick={getCurrentLocation}
                  className="min-h-[40px] px-3 py-2 text-sm font-semibold bg-sky-600 text-white rounded-lg hover:bg-sky-700"
                >
                  Get precise location
                </button>
              </div>
            )}
          </div>

          <div className="meeting-field">
            <label>Start Photos *</label>
            <div className="meeting-photo-box">
              <EnhancedPhotoUpload
                onUploadComplete={handleCheckInPhotoUpload}
                onUploadError={handlePhotoUploadError}
                disabled={isSubmitting}
                maxFileSize={50}
                compressionQuality={0.7}
                showCameraInGallery={true}
              />
            </div>

            {photoUploadError && (
              <p className="mt-2 text-sm text-rose-600">{photoUploadError}</p>
            )}

            {checkInPhotos.length > 0 && (
              <div className="mt-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-emerald-700">
                    {checkInPhotos.length} photo{checkInPhotos.length !== 1 ? 's' : ''} added
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setCheckInPhotos([]);
                      setUploadedPhotoSize('');
                    }}
                    className="text-xs text-rose-600 hover:text-rose-800 underline"
                  >
                    Clear all
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {checkInPhotos.map((photo, index) => (
                    <div key={index} className="relative">
                      <img
                        src={photo}
                        alt={`Check-in photo ${index + 1}`}
                        className="w-full h-20 object-cover rounded-lg border border-slate-200"
                      />
                      <button
                        type="button"
                        onClick={() => removeCheckInPhoto(index)}
                        className="absolute top-1 right-1 bg-rose-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs"
                        title="Remove photo"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="meeting-field">
            <label htmlFor="notes">Meeting Notes</label>
            <textarea
              id="notes"
              value={meetingNotes}
              onChange={(e) => setMeetingNotes(e.target.value)}
              rows={3}
              placeholder="Optional notes about the meeting..."
            />
          </div>

          <div className="flex flex-col-reverse sm:flex-row gap-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
            <button
              type="button"
              onClick={onClose}
              className="w-full sm:w-auto min-h-[44px] px-4 py-2 text-sm font-semibold text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !location || checkInPhotos.length === 0}
              className="w-full flex-1 min-h-[44px] px-4 py-2 text-sm font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? 'Sending meeting and photos…' : 'Start Meeting'}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
};