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
    <Modal title="Plan a New Meeting" onClose={onClose} fullScreenOnMobile maxWidth="max-w-lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="meeting-field">
          <label htmlFor="lead-search">
            Agency / Partner <span className="text-rose-500 normal-case tracking-normal">*</span>
          </label>
          <div className="relative overflow-visible">
            <div className="relative">
              <input
                id="lead-search"
                type="text"
                placeholder="Search by name or city..."
                value={inputDisplayValue}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setSelectedLeadId('');
                  setDropdownOpen(true);
                }}
                onFocus={() => setDropdownOpen(true)}
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
                className="mt-1 w-full max-h-48 overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg py-1 z-20 relative"
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
                      className={`px-3 py-2.5 text-sm cursor-pointer ${
                        selectedLeadId === lead.id ? 'bg-indigo-50' : 'hover:bg-slate-50'
                      }`}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        setSelectedLeadId(lead.id);
                        setSearchTerm('');
                        setDropdownOpen(false);
                      }}
                    >
                      <div className="font-medium text-slate-900 break-words">{lead.agencyName}</div>
                      {city ? (
                        <div className="mt-0.5 text-xs text-slate-500">{city}</div>
                      ) : null}
                    </li>
                    );
                  })
                )}
              </ul>
            )}
          </div>
        </div>

        <div className="meeting-field">
          <label htmlFor="meeting-date">Date & Time</label>
          <input
            id="meeting-date"
            type="datetime-local"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            min={new Date().toISOString().slice(0, 16)}
            required
          />
        </div>

        <div className="meeting-field">
          <label htmlFor="meeting-duration">Duration (minutes)</label>
          <input
            id="meeting-duration"
            type="number"
            min={15}
            max={480}
            step={15}
            value={durationMinutes}
            onChange={(e) => setDurationMinutes(Number(e.target.value) || 60)}
          />
        </div>

        <div className="meeting-field">
          <label htmlFor="meeting-notes">Notes / Agenda</label>
          <textarea
            id="meeting-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="e.g., Discuss partnership agreement..."
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
            className="w-full flex-1 min-h-[44px] px-4 py-2 text-sm font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700"
          >
            Schedule Meeting
          </button>
        </div>
      </form>
    </Modal>
  );
};
