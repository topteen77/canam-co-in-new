import React, { useState, useMemo } from 'react';
import { Modal } from './Modal';
import type { Lead, FollowUp } from '../types';

interface PlanMeetingModalProps {
  leads: Lead[];
  onClose: () => void;
  onSchedule: (leadId: string, meetingDetails: Omit<FollowUp, 'id' | 'type' | 'status'> & { durationMinutes?: number }) => void;
}

function getLeadContacts(lead: Lead): Record<string, unknown>[] {
  const raw: unknown = lead.contacts as unknown;
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
      if (parsed && typeof parsed === 'object') return [parsed];
    } catch {
      return [];
    }
  }
  if (raw && typeof raw === 'object') return [raw as Record<string, unknown>];
  return [];
}

function collectText(value: unknown, out: string[] = []): string[] {
  if (value == null) return out;
  if (typeof value === 'string' || typeof value === 'number') {
    out.push(String(value));
    return out;
  }
  if (Array.isArray(value)) {
    value.forEach((v) => collectText(v, out));
    return out;
  }
  if (typeof value === 'object') {
    Object.values(value).forEach((v) => collectText(v, out));
  }
  return out;
}

function leadCityLabel(lead: Lead, term = ''): string {
  const cities = getLeadContacts(lead)
    .map((c) => c?.city || c?.City)
    .filter((c) => c != null && String(c).trim())
    .map((c) => String(c).trim());
  const t = term.toLowerCase().trim();
  return (t && cities.find((c) => c.toLowerCase().includes(t))) || cities[0] || '';
}

export const PlanMeetingModal: React.FC<PlanMeetingModalProps> = ({ leads, onClose, onSchedule }) => {
  const safeLeads = Array.isArray(leads) ? leads : [];
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedLeadId, setSelectedLeadId] = useState<string>('');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [date, setDate] = useState(() => {
    const now = new Date();
    // Manual IST offset logic (original)
    now.setHours(now.getHours() + 5);
    now.setMinutes(now.getMinutes() + 30);
    return now.toISOString().slice(0, 16);
  });
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [notes, setNotes] = useState('');

  const filteredLeads = useMemo(() => {
    if (!searchTerm.trim()) return safeLeads;
    const term = searchTerm.toLowerCase().trim();
    return safeLeads.filter((l) => {
      const nameMatch = (l.agencyName || '').toLowerCase().includes(term);
      const countryMatch = (l.country || '').toLowerCase().includes(term);
      const remarksMatch = (l.remarks || '').toLowerCase().includes(term);
      const cityMatch = getLeadContacts(l).some((c) => collectText(c).join(' ').toLowerCase().includes(term));
      return nameMatch || countryMatch || remarksMatch || cityMatch;
    });
  }, [safeLeads, searchTerm]);

  const selectedLead = safeLeads.find((l) => l.id === selectedLeadId);
  const inputDisplayValue = selectedLeadId && selectedLead ? selectedLead.agencyName || '' : searchTerm;
  const showSuggestions = !selectedLeadId && (dropdownOpen || Boolean(searchTerm.trim()));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLeadId) {
      alert('Please select an agency.');
      return;
    }
    onSchedule(selectedLeadId, {
      date: new Date(date).toISOString(),
      notes,
      durationMinutes,
    });
  };

  return (
    <Modal title="Plan a New Meeting" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="lead-search" className="block text-sm font-medium text-slate-700 mb-1">
            Agency / Partner <span className="text-red-500">*</span>
          </label>
          <div className="relative overflow-visible">
            <div className="relative">
              <input
                id="lead-search"
                type="text"
                placeholder="Search agency/partner by name or city..."
                value={inputDisplayValue}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setSelectedLeadId('');
                  setDropdownOpen(true);
                }}
                onFocus={() => setDropdownOpen(true)}
                className="w-full px-3 py-2 pr-10 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                autoComplete="off"
              />
              <div className="absolute right-3 top-1/2 transform -translate-y-1/2 pointer-events-none text-slate-400">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
            </div>
            {showSuggestions && (
              <ul
                className="mt-1 w-full max-h-48 overflow-auto rounded-md border border-slate-300 bg-white shadow-lg py-1"
                role="listbox"
              >
                {filteredLeads.length === 0 ? (
                  <li className="px-3 py-2 text-sm text-slate-500">No agency found</li>
                ) : (
                  filteredLeads.map((lead) => {
                    const city = leadCityLabel(lead, searchTerm);
                    return (
                    <li
                      key={lead.id}
                      role="option"
                      aria-selected={selectedLeadId === lead.id}
                      className={`px-3 py-2 text-sm cursor-pointer ${
                        selectedLeadId === lead.id ? 'bg-indigo-50' : 'hover:bg-slate-100'
                      }`}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        setSelectedLeadId(lead.id);
                        setSearchTerm('');
                        setDropdownOpen(false);
                      }}
                    >
                      <div className="font-medium text-slate-900">{lead.agencyName}</div>
                      {city ? (
                        <div className="flex items-center gap-1 mt-0.5 text-xs text-slate-500">
                          <svg className="h-3 w-3 text-red-500 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
                          </svg>
                          {city}
                        </div>
                      ) : null}
                    </li>
                    );
                  })
                )}
              </ul>
            )}
          </div>
        </div>

        <div>
          <label htmlFor="meeting-date" className="block text-sm font-medium text-slate-700">
            Date & Time
          </label>
          <input
            id="meeting-date"
            type="datetime-local"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            min={new Date().toISOString().slice(0, 16)}
            required
            className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
          />
        </div>

        <div>
          <label htmlFor="meeting-duration" className="block text-sm font-medium text-slate-700">
            Duration (minutes)
          </label>
          <input
            id="meeting-duration"
            type="number"
            min={15}
            max={480}
            step={15}
            value={durationMinutes}
            onChange={(e) => setDurationMinutes(Number(e.target.value) || 60)}
            className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
          />
        </div>

        <div>
          <label htmlFor="meeting-notes" className="block text-sm font-medium text-slate-700">
            Notes / Agenda
          </label>
          <textarea
            id="meeting-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
            placeholder="e.g., Discuss partnership agreement..."
          />
        </div>

        {/* Google Integration - commented out for now
        <div className="border-t border-slate-200 pt-4 space-y-3">
          <div className="text-sm font-medium text-slate-700 mb-2">Google Integration</div>
          <div className="flex items-center">
            <input
              id="enable-google-calendar"
              type="checkbox"
              disabled
              className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-slate-300 rounded"
            />
            <label htmlFor="enable-google-calendar" className="ml-2 block text-sm text-slate-700">
              Add to Google Calendar
            </label>
          </div>
          <p className="text-xs text-slate-500 ml-6">Sign in with Google to use Calendar and Meet integration.</p>
        </div>
        */}

        <div className="flex justify-end gap-3 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-md hover:bg-slate-200"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Schedule Meeting
          </button>
        </div>
      </form>
    </Modal>
  );
};
