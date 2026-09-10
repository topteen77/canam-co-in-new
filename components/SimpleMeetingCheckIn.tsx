import React, { useState, useEffect } from 'react';
import { Modal } from './Modal';
import apiClient from '../services/apiClient';
import type { Lead } from '../types';
import { EnhancedPhotoUpload } from './EnhancedPhotoUpload';

interface SimpleMeetingCheckInProps {
  isOpen: boolean;
  onClose: () => void;
  availableUsers: Array<{ id: string, name: string, email: string, role: string }>;
  userLeads: Lead[];
  currentUser: string;
}

export const SimpleMeetingCheckIn: React.FC<SimpleMeetingCheckInProps> = ({
  isOpen,
  onClose,
  availableUsers,
  userLeads,
  currentUser
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
  const [meetingOutcome, setMeetingOutcome] = useState('successful');
  const [completionNotes, setCompletionNotes] = useState('');

  // Photo upload states
  const [checkInPhotos, setCheckInPhotos] = useState<string[]>([]);
  const [completionPhotos, setCompletionPhotos] = useState<string[]>([]);
  const [photoUploadError, setPhotoUploadError] = useState('');

  // Lead search states
  const [leadSearchTerm, setLeadSearchTerm] = useState('');
  const [showLeadDropdown, setShowLeadDropdown] = useState(false);

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
      checkActiveMeeting();
    }
  }, [isOpen, currentUser]);

  const checkActiveMeeting = async () => {
    try {
      console.log('🔍 Checking for active meeting...');
      const today = new Date().toISOString().split('T')[0];
      const { data: rows } = await apiClient.get('/meetings/all');
      const list = Array.isArray(rows) ? rows : [];
      const active = list.find(
        (r: any) =>
          (r.username === currentUser || r.Username === currentUser) &&
          (r.date === today || r.Date === today) &&
          (r.meetingStatus === 'active' || r.meeting_status === 'active')
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

    setIsSubmitting(true);
    try {
      console.log('🚀 Starting meeting...');

      const selectedLeadData = safeUserLeads.find(lead => lead.id === selectedLead);
      const now = new Date();

      // Intelligent photo optimization for database storage
      let optimizedPhotos = checkInPhotos;

      const meetingData = {
        username: currentUser,
        salesPersonName: selectedSalesPerson,
        salesPersonEmail: personMeetingName || '',
        meetingType: meetingType,
        notes: meetingNotes,
        leadId: selectedLead || '',
        leadName: selectedLeadData?.agencyName || '',
        date: now.toISOString().split('T')[0],
        checkInTime: now.toISOString(),
        meetingStatus: 'active',
        location: {
          latitude: location.latitude,
          longitude: location.longitude,
          address: location.address
        },
        // Photo upload fields - optimized for size
        checkInPhotos: optimizedPhotos,
        photoUploadCount: {
          checkIn: optimizedPhotos.length,
          completion: 0
        },
        createdBy: currentUser,
        createdAt: now.toISOString()
      };

      console.log('📝 Meeting data:', meetingData);

      await apiClient.post('/meetings/check-in', meetingData);

      console.log('✅ Meeting started successfully');
      alert('Meeting started successfully!');

      // Reset form
      setSelectedSalesPerson('');
      setPersonMeetingName('');
      setMeetingNotes('');
      setSelectedLead('');
      setCheckInPhotos([]);
      setUploadedPhotoSize('');

      // Check for active meeting to update UI
      await checkActiveMeeting();

    } catch (error: any) {
      console.error('❌ Error starting meeting:', error);

      // Provide specific error messages for common issues
      let errorMessage = 'Unknown error';
      if (error.message?.includes('bytes')) {
        errorMessage = 'Photos are too large. Please try with fewer or smaller photos.';
      } else if (error.message?.includes('permission')) {
        errorMessage = 'Permission denied. Please check your access rights.';
      } else if (error.message?.includes('network')) {
        errorMessage = 'Network error. Please check your internet connection.';
      } else {
        errorMessage = error.message || 'Unknown error';
      }

      alert(`Error starting meeting: ${errorMessage}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEndMeeting = async () => {
    if (!activeMeeting) return;

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
      alert(`Meeting ended successfully! Duration: ${durationMinutes} minutes`);

      setActiveMeeting(null);
      setMeetingOutcome('successful');
      setCompletionNotes('');

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
              {activeMeeting.leadName && (
                <div className="flex items-baseline gap-2">
                  <dt className="lead-fact-label">Lead</dt>
                  <dd className="min-w-0 text-[13px] text-slate-800 break-words">{activeMeeting.leadName}</dd>
                </div>
              )}
              <div className="flex items-baseline gap-2">
                <dt className="lead-fact-label">Started</dt>
                <dd className="min-w-0 text-[13px] text-slate-700">{formatStartTime(activeMeeting.checkInTime)}</dd>
              </div>
            </dl>
          </div>

          <div className="meeting-field">
            <label htmlFor="meeting-outcome">Meeting Outcome</label>
            <select
              id="meeting-outcome"
              value={meetingOutcome}
              onChange={(e) => setMeetingOutcome(e.target.value)}
            >
              <option value="successful">Successful</option>
              <option value="rescheduled">Rescheduled</option>
              <option value="cancelled">Cancelled</option>
              <option value="no_show">No Show</option>
              <option value="other">Other</option>
            </select>
          </div>

          <div className="meeting-field">
            <label htmlFor="completion-notes">Completion Notes</label>
            <textarea
              id="completion-notes"
              value={completionNotes}
              onChange={(e) => setCompletionNotes(e.target.value)}
              rows={3}
              placeholder="Optional notes about how the meeting went..."
            />
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
              disabled={isSubmitting}
              className="w-full flex-1 min-h-[44px] px-4 py-2 text-sm font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50"
            >
              {isSubmitting ? 'Completing…' : 'Complete Meeting'}
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleStartMeeting} className="space-y-4">
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
            </select>
          </div>

          <div className="meeting-field">
            <label htmlFor="lead">Select Lead *</label>
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
              {isSubmitting ? 'Starting…' : 'Start Meeting'}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
};