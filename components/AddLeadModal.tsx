import React, { useCallback, useState } from 'react';
import { Modal } from './Modal';
import { ImageUploadOCR } from './ImageUploadOCR';
import { SuggestInput } from './SuggestInput';
import { ExtractAssignProvider, DroppableField, InputWithClear, StickyExtractTool } from './ExtractAssign';
import { MultiSelect } from './MultiSelect';
import { SimpleDocUpload } from './SimpleDocUpload';
import { getUserDisplayName } from '../utils/dataCleaning';
import {
  inferLocationFromCity,
  suggestAddresses,
  suggestCities,
  suggestCountries,
  suggestDesignations,
  suggestStates,
  type LocationSuggestion
} from '../utils/locationSuggest';
import { DEFAULT_CONTACT_COUNTRY } from '../utils/countriesAndCities';
import { IcpScoringModal } from './IcpScoringModal';
import type { Lead, AgencyDocuments } from '../types';
import type { ExtractedLeadData } from '../services/ocrService';
import { LEAD_STATUSES, AGENT_CATEGORIES, LEAD_SOURCES } from '../types';

interface AddLeadModalProps {
  onClose: () => void;
  onAddLead: (data: Partial<Lead>) => Promise<void>;
  currentUser: string | null;
  isAdmin: boolean;
  availableUsers: Array<{ id: string; name: string; email: string; role: string }>;
  availableTags: string[];
  onCreateTag?: (tagName: string) => Promise<string>;
}

export const AddLeadModal: React.FC<AddLeadModalProps> = ({
  onClose,
  onAddLead,
  currentUser,
  isAdmin,
  availableUsers,
  availableTags,
  onCreateTag
}) => {
  const [ocrError, setOcrError] = useState('');
  const [formData, setFormData] = useState({
    agencyName: '',
    contactName: '',
    phone: '',
    email: '',
    address: '',
    city: '',
    state: '',
    country: DEFAULT_CONTACT_COUNTRY,
    alternateMobile: '',
    pocDesignation: '',
    status: 'New' as Lead['status'],
    agentCategory: 'Beginner' as Lead['agentCategory'],
    leadSource: 'Website' as Lead['leadSource'],
    tags: [] as string[],
    accountManager: '',
    salesPerson: '',
    onboardingDate: '',
    potentialStudentsCount: '',
    remarks: '',
    websiteLink: '',
    icpScore: undefined as number | undefined,
    trainingDate: '',
    trainingScore: undefined as number | undefined
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [agencyDocuments, setAgencyDocuments] = useState<AgencyDocuments>({});
  const [newTagName, setNewTagName] = useState('');
  const [tagError, setTagError] = useState('');
  const [isCreatingTag, setIsCreatingTag] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // ICP Score Modal States
  const [showIcpScoreModal, setShowIcpScoreModal] = useState(false);
  const [categoryScores, setCategoryScores] = useState<Record<string, number | ''>>({
    'Business Profile': '',
    'Services Portfolio': '',
    'Online Presence': '',
    'Operational Scale': '',
    'Applicant Volume': '',
    'Team Strength': '',
    'Network Strength': '',
    'Applicant Quality': '',
    'Physical Presence': ''
  });

  const handleInputChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (formErrors[field]) setFormErrors((prev) => ({ ...prev, [field]: '' }));
  };

  const handlePhoneChange = (field: string, value: string) => {
    const clean = value.replace(/\D/g, '').slice(0, 10);
    handleInputChange(field, clean);
  };

  const handleEmailChange = (field: string, value: string) => {
    handleInputChange(field, value.trim().toLowerCase());
  };

  const validatePhone = (phone: string) => !phone || /^\d{10}$/.test(phone);
  const validateEmail = (email: string) => !email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  const validateForm = () => {
    const errors: Record<string, string> = {};
    if (!formData.agencyName.trim()) errors.agencyName = 'Agency name is required';
    if (formData.phone && !validatePhone(formData.phone)) errors.phone = 'Phone must be exactly 10 digits';
    if (formData.email && !validateEmail(formData.email)) errors.email = 'Please enter a valid email';
    if (formData.alternateMobile && !validatePhone(formData.alternateMobile)) errors.alternateMobile = 'Alternate mobile must be 10 digits';
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleDocumentUpload = (documentType: 'companyRegistration' | 'panCard' | 'gstNumber' | 'mou', document: any) => {
    setAgencyDocuments((prev) => ({ ...prev, [documentType]: document }));
  };

  const handleTagsChange = (values: string[]) => {
    setFormData((prev) => ({ ...prev, tags: values }));
  };

  const handleCreateNewTag = async () => {
    if (!onCreateTag) return;
    const trimmed = newTagName.trim();
    if (!trimmed) {
      setTagError('Enter a tag name');
      return;
    }
    setIsCreatingTag(true);
    setTagError('');
    try {
      const created = await onCreateTag(trimmed);
      setFormData((prev) => ({ ...prev, tags: Array.from(new Set([...(prev.tags || []), created])) }));
      setNewTagName('');
    } catch (e) {
      setTagError(e instanceof Error ? e.message : 'Failed to add tag');
    } finally {
      setIsCreatingTag(false);
    }
  };

  const applyLocationSuggestion = (item: LocationSuggestion) => {
    setFormData((prev) => ({
      ...prev,
      address: item.address || prev.address,
      city: item.city || prev.city,
      state: item.state || prev.state,
      country: item.country || prev.country
    }));
    setFormErrors((prev) => ({ ...prev, address: '', city: '', state: '', country: '' }));
  };

  const handleOCRComplete = (extractedData: any) => {
    setFormData((prev) => {
      const next = { ...prev };
      if (extractedData.agencyName) next.agencyName = extractedData.agencyName;
      if (extractedData.contactName) next.contactName = extractedData.contactName;
      if (extractedData.phone) next.phone = extractedData.phone.replace(/\D/g, '').slice(-10);
      if (extractedData.email) next.email = extractedData.email;
      if (extractedData.address) next.address = extractedData.address;
      if (extractedData.city) next.city = extractedData.city;
      if (extractedData.state) next.state = extractedData.state;
      if (extractedData.country) next.country = extractedData.country;
      if (extractedData.alternateMobile) next.alternateMobile = extractedData.alternateMobile.replace(/\D/g, '').slice(-10);
      if (extractedData.pocDesignation) next.pocDesignation = extractedData.pocDesignation;
      if (extractedData.websiteLink) next.websiteLink = extractedData.websiteLink;
      if (extractedData.remarks) next.remarks = extractedData.remarks;
      if (next.city && (!next.state || !next.country)) {
        const inferred = inferLocationFromCity(next.city);
        if (!next.country && inferred.country) next.country = inferred.country;
        if (!next.state && inferred.state) next.state = inferred.state;
      }
      return next;
    });
    setOcrError('');
  };

  const handleAssignSnippet = useCallback((field: keyof ExtractedLeadData, value: string) => {
    if (field === 'phone' || field === 'alternateMobile') {
      const digits = value.replace(/\D/g, '').slice(-10);
      setFormData((prev) => ({ ...prev, [field]: digits }));
      if (formErrors[field]) setFormErrors((prev) => ({ ...prev, [field]: '' }));
      return;
    }
    if (field === 'email') {
      const email = value.trim().toLowerCase();
      setFormData((prev) => ({ ...prev, email }));
      if (formErrors.email) setFormErrors((prev) => ({ ...prev, email: '' }));
      return;
    }
    if (field === 'city') {
      const inferred = inferLocationFromCity(value);
      setFormData((prev) => ({
        ...prev,
        city: value,
        state: inferred.state || prev.state,
        country: inferred.country || prev.country
      }));
      return;
    }
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (formErrors[field as string]) setFormErrors((prev) => ({ ...prev, [field]: '' }));
  }, [formErrors]);

  const citySuggestions = useCallback(
    (query: string) => suggestCities(query, formData.country),
    [formData.country]
  );
  const stateSuggestions = useCallback(
    (query: string) => suggestStates(query, formData.country),
    [formData.country]
  );
  const countrySuggestions = useCallback((query: string) => suggestCountries(query), []);
  const designationSuggestions = useCallback((query: string) => suggestDesignations(query), []);
  const addressSuggestions = useCallback((query: string) => suggestAddresses(query), []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    if (!validateForm()) {
      alert('Please fix the form errors before submitting');
      return;
    }
    setIsSubmitting(true);
    try {
      const contactId = `contact_${Date.now()}`;
      await onAddLead({
        agencyName: formData.agencyName.trim(),
        status: formData.status,
        agentCategory: formData.agentCategory,
        leadSource: formData.leadSource,
        tags: formData.tags || [],
        accountManager: formData.accountManager.trim() || undefined,
        salesPerson: formData.salesPerson.trim() || undefined,
        remarks: formData.remarks.trim() || undefined,
        websiteLink: formData.websiteLink.trim() || undefined,
        icpScore: formData.icpScore ?? undefined,
        onboardingDate: formData.onboardingDate.trim() || undefined,
        applicants: formData.potentialStudentsCount.trim() || undefined,
        trainingDate: formData.trainingDate.trim() || undefined,
        trainingScore: formData.trainingScore ?? undefined,
        agencyDocuments: Object.keys(agencyDocuments).length ? agencyDocuments : undefined,
        contacts: [{
          id: contactId,
          name: formData.contactName.trim() || formData.agencyName.trim(),
          role: 'POC',
          phone: formData.phone.trim(),
          email: formData.email.trim() || undefined,
          address: formData.address.trim() || undefined,
          city: formData.city.trim() || undefined,
          state: formData.state.trim() || undefined,
          country: formData.country.trim() || undefined,
          alternateMobile: formData.alternateMobile.trim() || undefined,
          pocName: formData.contactName.trim() || undefined,
          pocDesignation: formData.pocDesignation.trim() || undefined
        }],
        followUps: []
      });
      onClose();
    } catch (err: any) {
      alert(err?.message || 'Failed to add lead. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ExtractAssignProvider onAssign={handleAssignSnippet}>
    <>
    <Modal title="Add New Agency/Partner" onClose={onClose} maxWidth="max-w-5xl" footer={<StickyExtractTool />}>
      <form onSubmit={handleSubmit} className="space-y-4 bg-gradient-to-br from-blue-50 to-indigo-50 p-4 sm:p-6 rounded-lg">
        {/* OCR */}
        <ImageUploadOCR onExtractComplete={handleOCRComplete} onError={setOcrError} />
        {ocrError && (
          <div className="bg-red-50 border-2 border-red-200 rounded-lg p-3">
            <p className="text-sm font-medium text-red-800">⚠️ {ocrError}</p>
            <p className="text-xs text-red-600 mt-1">You can still fill the form manually.</p>
          </div>
        )}

        {/* Agency Name */}
        <div className="bg-white p-3 rounded-lg shadow-sm border border-blue-200">
          <DroppableField field="agencyName">
            <label htmlFor="agencyName" className="block text-sm font-bold text-slate-800 mb-1">🏢 Agency / Partner Name *</label>
            <InputWithClear value={formData.agencyName} onClear={() => handleInputChange('agencyName', '')}>
              <input
                type="text"
                id="agencyName"
                value={formData.agencyName}
                onChange={(e) => handleInputChange('agencyName', e.target.value)}
                className={`block w-full px-3 py-2 text-sm border-2 rounded-lg focus:border-indigo-500 bg-white min-h-[44px] ${formData.agencyName ? 'pr-10' : ''} ${formErrors.agencyName ? 'border-red-500' : 'border-slate-300'}`}
                placeholder="Enter agency or partner name"
                required
              />
            </InputWithClear>
            {formErrors.agencyName && <p className="mt-1 text-xs font-medium text-red-600">⚠️ {formErrors.agencyName}</p>}
          </DroppableField>
        </div>

        {/* Account Manager, Sales Person, Lead Created By */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white p-3 rounded-lg shadow-sm border border-blue-200">
            <label className="block text-sm font-bold text-slate-800 mb-1">👤 Account Manager</label>
            <select
              value={formData.accountManager}
              onChange={(e) => handleInputChange('accountManager', e.target.value)}
              className="block w-full px-3 py-2 text-sm border-2 border-slate-300 rounded-lg bg-white min-h-[44px]"
            >
              <option value="">Select (Optional)</option>
              {currentUser && <option value={currentUser}>Me ({getUserDisplayName(currentUser)})</option>}
              {availableUsers.map((u) => <option key={u.id} value={u.email}>{u.name} - {u.role}</option>)}
            </select>
          </div>
          <div className="bg-white p-3 rounded-lg shadow-sm border border-blue-200">
            <label className="block text-sm font-bold text-slate-800 mb-1">💼 Sales Person</label>
            <select
              value={formData.salesPerson}
              onChange={(e) => handleInputChange('salesPerson', e.target.value)}
              className="block w-full px-3 py-2 text-sm border-2 border-slate-300 rounded-lg bg-white min-h-[44px]"
            >
              <option value="">Select (Optional)</option>
              {currentUser && <option value={currentUser}>Me ({getUserDisplayName(currentUser)})</option>}
              {availableUsers.map((u) => <option key={u.id} value={u.email}>{u.name} - {u.role}</option>)}
            </select>
          </div>
          <div className="bg-white p-3 rounded-lg shadow-sm border border-blue-200">
            <label className="block text-sm font-bold text-slate-800 mb-1">✍️ Lead Created By</label>
            <input
              type="text"
              value={currentUser ? getUserDisplayName(currentUser) : ''}
              disabled
              className="block w-full px-3 py-2 text-sm border-2 border-slate-300 rounded-lg bg-slate-100 min-h-[44px]"
            />
          </div>
        </div>

        {/* Contact Information */}
        <div className="bg-white p-4 rounded-lg shadow-sm border border-blue-200">
          <h3 className="text-lg font-bold text-slate-800 mb-3">📞 Contact Information</h3>
          <div className="space-y-3">
            <DroppableField field="contactName">
              <label className="block text-sm font-bold text-slate-800 mb-1">👤 Primary Contact Name</label>
              <InputWithClear value={formData.contactName} onClear={() => handleInputChange('contactName', '')}>
                <input
                  type="text"
                  value={formData.contactName}
                  onChange={(e) => handleInputChange('contactName', e.target.value)}
                  className={`block w-full px-3 py-2 text-sm border-2 border-slate-300 rounded-lg min-h-[44px] ${formData.contactName ? 'pr-10' : ''}`}
                  placeholder="Primary contact person"
                />
              </InputWithClear>
            </DroppableField>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <DroppableField field="phone">
                <label className="block text-sm font-bold text-slate-800 mb-1">📱 Primary Mobile *</label>
                <InputWithClear value={formData.phone} onClear={() => handleInputChange('phone', '')}>
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => handlePhoneChange('phone', e.target.value)}
                    className={`block w-full px-3 py-2 text-sm border-2 rounded-lg min-h-[44px] ${formData.phone ? 'pr-10' : ''} ${formErrors.phone ? 'border-red-500' : 'border-slate-300'}`}
                    placeholder="9876543210"
                    maxLength={10}
                    required
                  />
                </InputWithClear>
                {formErrors.phone && <p className="mt-1 text-xs text-red-600">⚠️ {formErrors.phone}</p>}
              </DroppableField>
              <DroppableField field="email">
                <label className="block text-sm font-bold text-slate-800 mb-1">📧 Primary Email *</label>
                <InputWithClear value={formData.email} onClear={() => handleInputChange('email', '')}>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => handleEmailChange('email', e.target.value)}
                    className={`block w-full px-3 py-2 text-sm border-2 rounded-lg min-h-[44px] ${formData.email ? 'pr-10' : ''} ${formErrors.email ? 'border-red-500' : 'border-slate-300'}`}
                    placeholder="contact@agency.com"
                    required
                  />
                </InputWithClear>
                {formErrors.email && <p className="mt-1 text-xs text-red-600">⚠️ {formErrors.email}</p>}
              </DroppableField>
              <DroppableField field="alternateMobile">
                <label className="block text-sm font-bold text-slate-800 mb-1">📱 Alternate Mobile</label>
                <InputWithClear value={formData.alternateMobile} onClear={() => handleInputChange('alternateMobile', '')}>
                  <input
                    type="tel"
                    value={formData.alternateMobile}
                    onChange={(e) => handlePhoneChange('alternateMobile', e.target.value)}
                    className={`block w-full px-3 py-2 text-sm border-2 rounded-lg min-h-[44px] ${formData.alternateMobile ? 'pr-10' : ''} ${formErrors.alternateMobile ? 'border-red-500' : 'border-slate-300'}`}
                    placeholder="9876543210"
                    maxLength={10}
                  />
                </InputWithClear>
                {formErrors.alternateMobile && <p className="mt-1 text-xs text-red-600">⚠️ {formErrors.alternateMobile}</p>}
              </DroppableField>
            </div>
          </div>
        </div>

        {/* Additional Details */}
        <div className="bg-white p-4 rounded-lg shadow-sm border border-blue-200">
          <h3 className="text-lg font-bold text-slate-800 mb-3">📋 Additional Details</h3>
          <div className="space-y-3">
            <DroppableField field="pocDesignation">
              <label className="block text-sm font-bold text-slate-800 mb-1">💼 POC Designation</label>
              <SuggestInput
                value={formData.pocDesignation}
                onChange={(value) => handleInputChange('pocDesignation', value)}
                getSuggestions={designationSuggestions}
                placeholder="Director, Manager — start typing for suggestions"
              />
            </DroppableField>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="md:col-span-3">
                <DroppableField field="address">
                  <label className="block text-sm font-bold text-slate-800 mb-1">🏠 Address</label>
                  <SuggestInput
                    multiline
                    minChars={3}
                    value={formData.address}
                    onChange={(value) => handleInputChange('address', value)}
                    onSelect={applyLocationSuggestion}
                    getSuggestions={addressSuggestions}
                    placeholder="Start typing for address suggestions"
                  />
                  <p className="mt-1 text-xs text-slate-500">Suggestions fill city, state, and country when you pick one.</p>
                </DroppableField>
              </div>
              <DroppableField field="city">
                <label className="block text-sm font-bold text-slate-800 mb-1">🏙️ City</label>
                <SuggestInput
                  value={formData.city}
                  onChange={(value) => {
                    const inferred = inferLocationFromCity(value);
                    setFormData((prev) => ({
                      ...prev,
                      city: value,
                      state: inferred.state || prev.state,
                      country: inferred.country || prev.country
                    }));
                  }}
                  onSelect={(item) => {
                    setFormData((prev) => ({
                      ...prev,
                      city: item.city || item.label,
                      state: item.state || prev.state,
                      country: item.country || prev.country
                    }));
                  }}
                  getSuggestions={citySuggestions}
                  placeholder="Start typing a city"
                />
              </DroppableField>
              <DroppableField field="state">
                <label className="block text-sm font-bold text-slate-800 mb-1">🏛️ State</label>
                <SuggestInput
                  value={formData.state}
                  onChange={(value) => handleInputChange('state', value)}
                  onSelect={(item) => {
                    handleInputChange('state', item.state || item.label);
                    if (item.country) handleInputChange('country', item.country);
                  }}
                  getSuggestions={stateSuggestions}
                  placeholder="Start typing a state"
                />
              </DroppableField>
              <DroppableField field="country">
                <label className="block text-sm font-bold text-slate-800 mb-1">🌍 Country</label>
                <SuggestInput
                  value={formData.country}
                  onChange={(value) => handleInputChange('country', value)}
                  onSelect={(item) => handleInputChange('country', item.country || item.label)}
                  getSuggestions={countrySuggestions}
                  placeholder="Start typing a country"
                />
              </DroppableField>
            </div>
          </div>
        </div>

        {/* Lead Classification */}
        <div className="bg-white p-4 rounded-lg shadow-sm border border-blue-200">
          <h3 className="text-lg font-bold text-slate-800 mb-3">🏷️ Lead Classification</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-sm font-bold text-slate-800 mb-1">📊 Status</label>
              <select
                value={formData.status}
                onChange={(e) => handleInputChange('status', e.target.value)}
                className="block w-full px-3 py-2 text-sm border-2 border-slate-300 rounded-lg bg-white min-h-[44px]"
              >
                {LEAD_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-800 mb-1">⭐ Agent Category</label>
              <select
                value={formData.agentCategory}
                onChange={(e) => handleInputChange('agentCategory', e.target.value)}
                className="block w-full px-3 py-2 text-sm border-2 border-slate-300 rounded-lg bg-white min-h-[44px]"
              >
                {AGENT_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-800 mb-1">🔍 Lead Source</label>
              <select
                value={formData.leadSource}
                onChange={(e) => handleInputChange('leadSource', e.target.value)}
                className="block w-full px-3 py-2 text-sm border-2 border-slate-300 rounded-lg bg-white min-h-[44px]"
              >
                {LEAD_SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* Additional Information */}
        <div className="bg-white p-4 rounded-lg shadow-sm border border-blue-200">
          <h3 className="text-lg font-bold text-slate-800 mb-3">📈 Additional Information</h3>
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-bold text-slate-800 mb-1">📅 Date of Onboarding</label>
                <input
                  type="date"
                  value={formData.onboardingDate}
                  onChange={(e) => handleInputChange('onboardingDate', e.target.value)}
                  className="block w-full px-3 py-2 text-sm border-2 border-slate-300 rounded-lg min-h-[44px]"
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-800 mb-1">👥 Potential Students Count (One Month)</label>
                <input
                  type="number"
                  value={formData.potentialStudentsCount}
                  onChange={(e) => handleInputChange('potentialStudentsCount', e.target.value)}
                  className="block w-full px-3 py-2 text-sm border-2 border-slate-300 rounded-lg min-h-[44px]"
                  placeholder="25"
                  min={0}
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-800 mb-1 flex items-center gap-2">
                  <span>🎯</span> ICP Score (1-10)
                </label>
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="relative w-32">
                    <input
                      type="text"
                      value={formData.icpScore !== undefined ? formData.icpScore : ''}
                      readOnly
                      placeholder="1-10"
                      className="block w-full px-4 py-2 text-sm border-2 border-slate-200 rounded-lg bg-white font-semibold text-slate-700 focus:outline-none"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowIcpScoreModal(true)}
                    className="flex items-center justify-center gap-2 w-full sm:w-auto min-h-[44px] px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold shadow-lg shadow-indigo-200 transition-all active:scale-95"
                  >
                    <span>📊</span>
                    <span>View Scoring</span>
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-800 mb-1">Training Date</label>
                <input
                  type="date"
                  value={formData.trainingDate}
                  onChange={(e) => handleInputChange('trainingDate', e.target.value)}
                  className="block w-full px-3 py-2 text-sm border-2 border-slate-300 rounded-lg min-h-[44px]"
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-800 mb-1">Training Score</label>
                <input
                  type="number"
                  min={0}
                  max={10}
                  step={0.1}
                  value={formData.trainingScore !== undefined ? formData.trainingScore : ''}
                  onChange={(e) => setFormData(prev => ({
                    ...prev,
                    trainingScore: e.target.value === '' ? undefined : parseFloat(e.target.value)
                  }))}
                  className="block w-full px-3 py-2 text-sm border-2 border-slate-300 rounded-lg min-h-[44px]"
                  placeholder="0-10"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-800 mb-1">🏷️ Special Tags</label>
              <MultiSelect
                options={(availableTags || []).map((tag) => ({ value: tag, label: tag }))}
                selectedValues={formData.tags}
                onChange={handleTagsChange}
                placeholder="Select tags"
                className="text-sm"
              />
              {isAdmin && onCreateTag && (
                <div className="mt-2 flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    value={newTagName}
                    onChange={(e) => { setNewTagName(e.target.value); if (tagError) setTagError(''); }}
                    placeholder="Add new tag"
                    className="flex-1 px-3 py-2 text-sm border-2 border-slate-300 rounded-lg min-h-[44px]"
                  />
                  <button
                    type="button"
                    onClick={handleCreateNewTag}
                    disabled={isCreatingTag}
                    className="px-4 py-2 text-sm font-semibold text-white rounded-lg bg-indigo-600 hover:bg-indigo-700 min-h-[44px] disabled:opacity-50"
                  >
                    {isCreatingTag ? 'Adding…' : '➕ Add Tag'}
                  </button>
                </div>
              )}
              {tagError && <p className="mt-1 text-xs text-red-600">⚠️ {tagError}</p>}
            </div>
            <DroppableField field="websiteLink">
              <label className="block text-sm font-bold text-slate-800 mb-1">🌐 Website / Social Media Link</label>
              <InputWithClear value={formData.websiteLink} onClear={() => handleInputChange('websiteLink', '')}>
                <input
                  type="url"
                  value={formData.websiteLink}
                  onChange={(e) => handleInputChange('websiteLink', e.target.value)}
                  className={`block w-full px-3 py-2 text-sm border-2 border-slate-300 rounded-lg min-h-[44px] ${formData.websiteLink ? 'pr-10' : ''}`}
                  placeholder="https://..."
                />
              </InputWithClear>
            </DroppableField>
            <div>
              <label className="block text-sm font-bold text-slate-800 mb-1">📝 Remarks</label>
              <InputWithClear value={formData.remarks} onClear={() => handleInputChange('remarks', '')} multiline>
                <textarea
                  value={formData.remarks}
                  onChange={(e) => handleInputChange('remarks', e.target.value)}
                  rows={3}
                  className={`block w-full px-3 py-2 text-sm border-2 border-slate-300 rounded-lg ${formData.remarks ? 'pr-10' : ''}`}
                  placeholder="Additional notes..."
                />
              </InputWithClear>
            </div>
          </div>
        </div>

        {/* Agency Documents & MOU */}
        <div className="bg-white p-4 rounded-lg shadow-sm border border-blue-200">
          <h3 className="text-lg font-bold text-slate-800 mb-3">📄 Agency Documents & MOU (Optional)</h3>
          <p className="text-sm text-slate-600 mb-4">Upload now or add later when editing the lead.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <SimpleDocUpload leadId="new-lead" documentType="companyRegistration" documentLabel="Company Registration Proof" currentDocument={agencyDocuments.companyRegistration} onUploadComplete={(doc) => handleDocumentUpload('companyRegistration', doc)} currentUser={currentUser ?? ''} />
            <SimpleDocUpload leadId="new-lead" documentType="panCard" documentLabel="PAN CARD" currentDocument={agencyDocuments.panCard} onUploadComplete={(doc) => handleDocumentUpload('panCard', doc)} currentUser={currentUser ?? ''} />
            <SimpleDocUpload leadId="new-lead" documentType="gstNumber" documentLabel="GST NUMBER" currentDocument={agencyDocuments.gstNumber} onUploadComplete={(doc) => handleDocumentUpload('gstNumber', doc)} currentUser={currentUser ?? ''} />
            <SimpleDocUpload leadId="new-lead" documentType="mou" documentLabel="MOU" currentDocument={agencyDocuments.mou} onUploadComplete={(doc) => handleDocumentUpload('mou', doc)} currentUser={currentUser ?? ''} />
          </div>
        </div>

        {/* Buttons */}
        <div className="flex flex-col-reverse sm:flex-row justify-end gap-3 pt-4">
          <button type="button" onClick={onClose} className="px-6 py-2.5 min-h-[44px] text-sm font-bold text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 border-2 border-slate-300">
            ❌ Cancel
          </button>
          <button type="submit" disabled={isSubmitting} className={`px-6 py-2.5 min-h-[44px] text-sm font-bold text-white rounded-lg border-2 shadow-lg ${isSubmitting ? 'bg-gray-400 cursor-not-allowed' : 'bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 border-indigo-600'}`}>
            {isSubmitting ? '⏳ Adding Lead...' : '✅ Add Lead'}
          </button>
        </div>
      </form>
    </Modal>
    
    {showIcpScoreModal && (
      <IcpScoringModal
        onClose={() => setShowIcpScoreModal(false)}
        categoryScores={categoryScores}
        onCategoryScoreChange={(category, value) => {
          setCategoryScores((prev) => ({ ...prev, [category]: value }));
        }}
        onApply={(score) => {
          setFormData((prev) => ({ ...prev, icpScore: score }));
          setShowIcpScoreModal(false);
        }}
      />
    )}
    </>
    </ExtractAssignProvider>
  );
};
