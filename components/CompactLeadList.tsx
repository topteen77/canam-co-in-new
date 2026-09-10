import React, { useState, useMemo } from 'react';
import type { Lead, FollowUpType, FollowUpStatus } from '../types';
import { trackCallAction, trackWhatsAppAction, trackEmailAction } from '../services/ctaTrackingService';
import { EmailTemplateSelector } from './EmailTemplateSelector';
import { createWhatsAppUrl } from '../utils/whatsappUtils';
import { IcpScoringModal, clampIcpScore, emptyIcpCategoryScores } from './IcpScoringModal';
import { canMutateLead } from '../utils/leadPermissions';
import { partitionLeadsByOwnership, getLeadRelation, getLeadRelationBadge, LEAD_RELATION_HEADERS } from '../utils/leadVisibility';

interface CompactLeadListProps {
  leads: Lead[];
  onSelectLead: (lead: Lead, followUpId?: string) => void;
  onMeetingCheckIn: (leadId: string) => void;
  meetingCheckIns: any[];
  currentUser: string | null;
  isAdmin: boolean;
  userRole?: string | null;
  selectedLeads: string[];
  onToggleLeadSelection: (leadId: string) => void;
  onSelectAllLeads: () => void;
  availableUsers: Array<{id: string, name: string, email: string, role: string}>;
  onAssignLead?: (leadId: string, accountManager: string, salesPerson: string) => void;
  onBulkDeleteLeads?: (leadIds: string[]) => void;
  onBulkAssignLeads?: (leadIds: string[], accountManager: string, salesPerson: string) => void;
  onClearSelection?: () => void;
  onUpdateLead?: (leadId: string, updates: Partial<Lead>) => void;
}

interface ColumnConfig {
  id: string;
  label: string;
  width: string;
  visible: boolean;
  sortable?: boolean;
}

const getShortUserName = (email: string): string => {
  if (!email) return 'N/A';
  const name = email.split('@')[0];
  return name.length > 8 ? name.substring(0, 8) + '...' : name;
};

const getUserDisplayNameLocal = (email: string, availableUsers: Array<{id: string, name: string, email: string, role: string}>): string => {
  if (!email) return 'N/A';
  if (!availableUsers || availableUsers.length === 0) {
    return getShortUserName(email);
  }
  
  const user = availableUsers.find(u => u.email && u.email.toLowerCase() === email.toLowerCase());
  if (user && user.name && user.name.trim()) {
    return user.name.length > 8 ? user.name.substring(0, 8) + '...' : user.name;
  }
  
  return getShortUserName(email);
};

// Helper function to check if a follow-up is missed
const isMissedFollowUp = (followUp: any): boolean => {
  if (followUp.status !== 'Planned') return false;
  const followUpDate = new Date(followUp.date);
  const now = new Date();
  return followUpDate < now;
};

// 🟢 SAFE FIX: Rewritten getNextAction to handle null data safely
const getNextAction = (lead: Lead) => {
  // Ensure followUps is an array
  const safeFollowUps = Array.isArray(lead.followUps) ? lead.followUps : [];
  
  if (safeFollowUps.length === 0) {
    return { action: 'No follow-ups', date: '', time: '', isMissed: false };
  }
  
  // Find the next upcoming follow-up
  const upcomingFollowUps = safeFollowUps
    .filter(fu => fu.status === 'Planned')
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  
  if (upcomingFollowUps.length > 0) {
    const nextFollowUp = upcomingFollowUps[0];
    const date = new Date(nextFollowUp.date);
    return {
      action: nextFollowUp.type,
      date: date.toLocaleDateString(),
      time: date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      isMissed: isMissedFollowUp(nextFollowUp)
    };
  }
  
  // If no upcoming follow-ups, show the most recent one
  const recentFollowUp = [...safeFollowUps]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
  
  if (recentFollowUp) {
    const date = new Date(recentFollowUp.date);
    return {
      action: recentFollowUp.type,
      date: date.toLocaleDateString(),
      time: date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      isMissed: isMissedFollowUp(recentFollowUp)
    };
  }
  
  return { action: 'No follow-ups', date: '', time: '', isMissed: false };
};

const getColumnIcon = (columnId: string): string => {
  const icons: { [key: string]: string } = {
    'select': '☑️',
    'agencyName': '🏢',
    'status': '📊',
    'leadSource': '🔗',
    'contact': '👤',
    'phone': '📞',
    'email': '📧',
    'onboardedDate': '📅',
    'onboardingDate': '🚀',
    'remarks': '📝',
    'city': '📍',
    'accountManager': '👨‍💼',
    'salesPerson': '💼',
    'createdBy': '👤',
    'createdAt': '📅',
    'followUps': '🔄',
    'nextAction': '⏭️',
    'actions': '⚙️',
    'icpScore': '🎯'
  };
  return icons[columnId] || '📋';
};

const getStatusColor = (status: string) => {
  const colors = {
    'New': 'bg-blue-100 text-blue-800',
    'In Pipeline': 'bg-amber-100 text-amber-800',
    'ICP Qualified': 'bg-purple-100 text-purple-800',
    'Portal Deactivated': 'bg-orange-100 text-orange-800',
    'Onboarded': 'bg-green-100 text-green-800',
    'Lost': 'bg-red-100 text-red-800',
    'MOU Signature Pending': 'bg-yellow-100 text-yellow-800',
    'Agent Portal Created': 'bg-indigo-100 text-indigo-800',
    'Agent Portal Reactivated': 'bg-teal-100 text-teal-800'
  };
  return colors[status as keyof typeof colors] || 'bg-gray-100 text-gray-800';
};

const getCategoryColor = (category: string) => {
  const colors = {
    'Diamond': 'bg-sky-100 text-sky-800',
    'Gold': 'bg-yellow-100 text-yellow-800',
    'Silver': 'bg-slate-200 text-slate-800',
    'Bronze': 'bg-orange-200 text-orange-800',
    'Beginner': 'bg-gray-100 text-gray-800',
  };
  return colors[category as keyof typeof colors] || 'bg-gray-100 text-gray-800';
};

// Email Link Icon Component for Compact View
const EmailLinkIconCompact: React.FC<{
  email: string;
  recipientName?: string;
  agencyName?: string;
  currentUser: string | null;
  leadId: string;
  leadName: string;
  getUserDisplayNameLocal: (email: string) => string;
}> = ({ email, recipientName, agencyName, currentUser, leadId, leadName, getUserDisplayNameLocal }) => {
  const [showEmailTemplateModal, setShowEmailTemplateModal] = useState(false);

  const handleEmailClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (currentUser) {
      trackEmailAction(
        currentUser,
        getUserDisplayNameLocal(currentUser),
        email,
        leadId,
        leadName,
        recipientName,
        leadName
      );
      setShowEmailTemplateModal(true);
    } else {
      window.open(`mailto:${email}`, '_self');
    }
  };

  return (
    <>
      <button
        onClick={handleEmailClick}
        className="p-1 text-orange-500 hover:text-orange-700 hover:bg-orange-100 rounded"
        title={`Email ${email}`}
      >
        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
          <path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/>
        </svg>
      </button>
      {currentUser && (
        <EmailTemplateSelector
          isOpen={showEmailTemplateModal}
          onClose={() => setShowEmailTemplateModal(false)}
          recipientEmail={email}
          recipientName={recipientName}
          agencyName={agencyName}
          currentUser={currentUser}
        />
      )}
    </>
  );
};

// Email Button for Mobile Card View
const EmailButtonMobile: React.FC<{
  email: string;
  recipientName?: string;
  agencyName?: string;
  currentUser: string | null;
  leadId: string;
  leadName: string;
  getUserDisplayNameLocal: (email: string) => string;
}> = ({ email, recipientName, agencyName, currentUser, leadId, leadName, getUserDisplayNameLocal }) => {
  const [showEmailTemplateModal, setShowEmailTemplateModal] = useState(false);

  const handleEmailClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (currentUser) {
      trackEmailAction(
        currentUser,
        getUserDisplayNameLocal(currentUser),
        email,
        leadId,
        leadName,
        recipientName,
        leadName
      );
      setShowEmailTemplateModal(true);
    } else {
      window.open(`mailto:${email}`, '_self');
    }
  };

  return (
    <>
      <button
        onClick={handleEmailClick}
        className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-orange-500 text-white rounded-xl text-base font-semibold hover:bg-orange-600 transition-colors shadow-sm"
      >
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
          <path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/>
        </svg>
        <span>Send Email</span>
      </button>
      {currentUser && (
        <EmailTemplateSelector
          isOpen={showEmailTemplateModal}
          onClose={() => setShowEmailTemplateModal(false)}
          recipientEmail={email}
          recipientName={recipientName}
          agencyName={agencyName}
          currentUser={currentUser}
        />
      )}
    </>
  );
};

// Email Button for Contact Details
const EmailButtonContact: React.FC<{
  email: string;
  recipientName?: string;
  agencyName?: string;
  currentUser: string | null;
  leadId: string;
  leadName: string;
  getUserDisplayNameLocal: (email: string) => string;
}> = ({ email, recipientName, agencyName, currentUser, leadId, leadName, getUserDisplayNameLocal }) => {
  const [showEmailTemplateModal, setShowEmailTemplateModal] = useState(false);

  const handleEmailClick = () => {
    if (currentUser) {
      trackEmailAction(
        currentUser,
        getUserDisplayNameLocal(currentUser),
        email,
        leadId,
        leadName,
        recipientName,
        leadName
      );
      setShowEmailTemplateModal(true);
    } else {
      window.open(`mailto:${email}`, '_self');
    }
  };

  return (
    <>
      <button
        onClick={handleEmailClick}
        className="px-3 py-1 bg-orange-500 text-white text-xs rounded hover:bg-orange-600"
      >
        Email
      </button>
      {currentUser && (
        <EmailTemplateSelector
          isOpen={showEmailTemplateModal}
          onClose={() => setShowEmailTemplateModal(false)}
          recipientEmail={email}
          recipientName={recipientName}
          agencyName={agencyName}
          currentUser={currentUser}
        />
      )}
    </>
  );
};

export const CompactLeadList: React.FC<CompactLeadListProps> = ({
  leads,
  onSelectLead,
  onMeetingCheckIn,
  meetingCheckIns,
  currentUser,
  isAdmin,
  userRole,
  selectedLeads,
  onToggleLeadSelection,
  onSelectAllLeads,
  availableUsers,
  onAssignLead,
  onUpdateLead
}) => {
  // Simple function to get user display name
  const getUserDisplayNameLocal = (email: string): string => {
    if (!email) return 'Unknown';
    
    // Try to find user in availableUsers first
    if (availableUsers && availableUsers.length > 0) {
      const user = availableUsers.find(u => u.email && u.email.toLowerCase() === (email || '').toLowerCase());
      if (user && user.name && user.name.trim()) {
        return user.name;
      }
    }
    
    const emailToNameMap: { [key: string]: string } = {
      'iapplyam2b2b@gmail.com': 'Nakul Kathota',
      'canamrakesh@gmail.com': 'Rakesh',
      'amit.iapply@gmail.com': 'Amit Kumar',
      'admin@iapply.com': 'Admin',
      'support@iapply.com': 'Support Team'
    };
    
    const mappedName = emailToNameMap[(email || '').toLowerCase()];
    if (mappedName) {
      return mappedName;
    }
    const safeEmail = email || '';
    const emailPrefix = safeEmail.split('@')[0] || 'Unknown';
    return emailPrefix.charAt(0).toUpperCase() + emailPrefix.slice(1);
  };

  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
  const [showContactPopup, setShowContactPopup] = useState(false);
  const [selectedLeadContacts, setSelectedLeadContacts] = useState<Lead | null>(null);
  const [showIcpScoreModal, setShowIcpScoreModal] = useState(false);
  const [selectedLeadForIcp, setSelectedLeadForIcp] = useState<Lead | null>(null);
  const [categoryScores, setCategoryScores] = useState(emptyIcpCategoryScores);
  const [columnConfig, setColumnConfig] = useState<ColumnConfig[]>([
    { id: 'select', label: '', width: 'w-12', visible: isAdmin },
    { id: 'agencyName', label: 'Agency', width: 'w-48', visible: true, sortable: true },
    { id: 'status', label: 'Status', width: 'w-20', visible: true, sortable: true },
    { id: 'icpScore', label: 'ICP Score', width: 'w-16', visible: true, sortable: true },
    { id: 'leadSource', label: 'Source', width: 'w-20', visible: false, sortable: true },
    { id: 'contact', label: 'Contact', width: 'w-24', visible: true },
    { id: 'phone', label: 'Phone', width: 'w-20', visible: true },
    { id: 'onboardedDate', label: 'Account Created', width: 'w-24', visible: false, sortable: true },
    { id: 'onboardingDate', label: 'Onboarding Date', width: 'w-24', visible: true, sortable: true },
    { id: 'remarks', label: 'Remarks', width: 'w-32', visible: true },
    { id: 'city', label: 'City', width: 'w-16', visible: true },
    { id: 'salesPerson', label: 'Sales', width: 'w-16', visible: false },
    { id: 'createdBy', label: 'By', width: 'w-16', visible: true, sortable: true },
    { id: 'createdAt', label: 'Date', width: 'w-16', visible: true, sortable: true },
    { id: 'followUps', label: 'Follow-ups', width: 'w-40', visible: true },
    { id: 'nextAction', label: 'Next Action', width: 'w-40', visible: true },
    { id: 'actions', label: 'Act', width: 'w-16', visible: true }
  ]);

  const [showColumnSelector, setShowColumnSelector] = useState(false);

  const sortedLeads = useMemo(() => {
    const compare = (a: Lead, b: Lead) => {
      if (!sortConfig) return 0;
      let aValue: any, bValue: any;

      switch (sortConfig.key) {
        case 'agencyName':
          aValue = (a.agencyName || '').toLowerCase();
          bValue = (b.agencyName || '').toLowerCase();
          break;
        case 'status':
          aValue = a.status;
          bValue = b.status;
          break;
        case 'icpScore':
          aValue = a.icpScore !== undefined && a.icpScore !== null ? a.icpScore : -1;
          bValue = b.icpScore !== undefined && b.icpScore !== null ? b.icpScore : -1;
          break;
        case 'category':
          aValue = a.agentCategory;
          bValue = b.agentCategory;
          break;
        case 'onboardingDate':
          aValue = a.onboardingDate ? new Date(a.onboardingDate).getTime() : 0;
          bValue = b.onboardingDate ? new Date(b.onboardingDate).getTime() : 0;
          break;
        case 'remarks':
          aValue = (a.remarks || '').toLowerCase();
          bValue = (b.remarks || '').toLowerCase();
          break;
        case 'createdBy':
          aValue = (a.createdBy || '').toLowerCase();
          bValue = (b.createdBy || '').toLowerCase();
          break;
        case 'createdAt':
          aValue = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          bValue = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          break;
        default:
          return 0;
      }

      if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    };

    const ordered = sortConfig ? [...leads].sort(compare) : leads;
    if (isAdmin || !currentUser) return ordered;
    return partitionLeadsByOwnership(ordered, { currentUser, isAdmin }).grouped;
  }, [leads, sortConfig, isAdmin, currentUser]);

  const handleSort = (key: string) => {
    setSortConfig(prev => ({
      key,
      direction: prev?.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const toggleColumnVisibility = (columnId: string) => {
    setColumnConfig(prev => prev.map(col => 
      col.id === columnId ? { ...col, visible: !col.visible } : col
    ));
  };

  const visibleColumns = columnConfig.filter(col => col.visible);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric'
    });
  };

  const formatPhone = (phone: string) => {
    if (!phone) return 'N/A';
    const maxLength = phone.startsWith('+') ? 18 : 15;
    return phone.length > maxLength ? phone.substring(0, maxLength) + '...' : phone;
  };

  const formatEmail = (email: string) => {
    if (!email) return 'N/A';
    const [name, domain] = email.split('@');
    return name.length > 8 ? name.substring(0, 8) + '...' : name;
  };

  return (
    <div className="w-full">
      {/* Column Selector - wraps on small screens */}
      <div className="mb-3 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <button
            onClick={() => setShowColumnSelector(!showColumnSelector)}
            className="px-2 sm:px-3 py-1 text-xs sm:text-sm bg-slate-100 hover:bg-slate-200 rounded-md border"
          >
            📊 Columns ({visibleColumns.length})
          </button>
          <div className="flex items-center gap-1">
            <button
              onClick={() => {
                setColumnConfig(prev => prev.map(col => ({
                  ...col,
                  visible: ['select', 'agencyName', 'status', 'icpScore', 'contact', 'phone', 'followUps', 'nextAction', 'actions'].includes(col.id)
                })));
              }}
              className="px-1.5 sm:px-2 py-0.5 sm:py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
              title="Essential columns only"
            >
              Essential
            </button>
            <button
              onClick={() => {
                setColumnConfig(prev => prev.map(col => ({
                  ...col,
                  visible: ['select', 'agencyName', 'status', 'icpScore', 'contact', 'phone', 'city', 'createdBy', 'followUps', 'nextAction', 'actions'].includes(col.id)
                })));
              }}
              className="px-1.5 sm:px-2 py-0.5 sm:py-1 text-xs bg-green-100 text-green-700 rounded hover:bg-green-200"
              title="All important columns"
            >
              Full
            </button>
            <button
              onClick={() => {
                setColumnConfig(prev => prev.map(col => ({ ...col, visible: true })));
              }}
              className="px-1.5 sm:px-2 py-0.5 sm:py-1 text-xs bg-purple-100 text-purple-700 rounded hover:bg-purple-200"
              title="Show all columns"
            >
              All
            </button>
          </div>
          <span className="text-xs sm:text-sm text-slate-600">
            {leads.length} leads • {selectedLeads.length} selected
            {!isAdmin && currentUser && sortedLeads.some(l => getLeadRelation(l, { currentUser, isAdmin }) !== 'mine') && (
              <span className="ml-2 text-slate-500 font-medium">
                · blue = created by you · amber = not connected
              </span>
            )}
          </span>
        </div>
        
        {isAdmin && (
          <div className="flex items-center gap-1.5 sm:gap-2">
            <button
              onClick={onSelectAllLeads}
              className="px-2 sm:px-3 py-1 text-xs bg-indigo-100 text-indigo-700 rounded hover:bg-indigo-200"
            >
              Select All
            </button>
            <button
              onClick={() => onToggleLeadSelection('')}
              className="px-2 sm:px-3 py-1 text-xs bg-slate-100 text-slate-700 rounded hover:bg-slate-200"
            >
              Clear
            </button>
          </div>
        )}
      </div>

      {/* Column Selector Dropdown */}
      {showColumnSelector && (
        <div className="mb-4 p-4 bg-white border border-slate-200 rounded-lg shadow-sm">
          <h4 className="font-medium text-blue-800 mb-3">Select Columns to Display</h4>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
            {columnConfig.map(column => (
              <label key={column.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={column.visible}
                  onChange={() => toggleColumnVisibility(column.id)}
                  className="rounded border-slate-300"
                />
                <span className="text-slate-700">{column.label}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Compact Table */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto max-w-full -mx-1 sm:mx-0">
          <table className="w-full min-w-[720px]">
            {/* Frozen Header */}
            <thead className="bg-slate-50 border-b border-slate-200 sticky top-0 z-10">
              <tr>
                {visibleColumns.map(column => (
                  <th
                    key={column.id}
                    className={`${column.width} px-0.5 sm:px-1 py-1.5 sm:py-2 text-left text-[10px] sm:text-xs font-medium text-slate-500 uppercase tracking-wider border-r border-slate-200 last:border-r-0 overflow-hidden min-w-0`}
                  >
                    {column.id === 'select' ? (
                      <input
                        type="checkbox"
                        checked={selectedLeads.length === leads.length && leads.length > 0}
                        onChange={onSelectAllLeads}
                        className="lead-list-checkbox rounded border-slate-300 h-3 w-3 sm:h-4 sm:w-4"
                      />
                    ) : column.sortable ? (
                      <button
                        onClick={() => handleSort(column.id)}
                        className="flex items-center gap-1 hover:text-slate-700"
                      >
                        <span className="text-xs">{getColumnIcon(column.id)}</span>
                        {column.label}
                        {sortConfig?.key === column.id && (
                          <span className="text-indigo-600">
                            {sortConfig.direction === 'asc' ? '↑' : '↓'}
                          </span>
                        )}
                      </button>
                    ) : (
                      <div className="flex items-center gap-1">
                        <span className="text-xs">{getColumnIcon(column.id)}</span>
                        {column.label}
                      </div>
                    )}
                  </th>
                ))}
              </tr>
            </thead>

            {/* Table Body */}
            <tbody className="bg-white divide-y divide-slate-200">
              {sortedLeads.map((lead, index) => {
                // 🟢 SAFE FIX: Pre-calculate safe lists for this row
                const safeContacts = Array.isArray(lead.contacts) ? lead.contacts : [];
                const safeFollowUps = Array.isArray(lead.followUps) ? lead.followUps : [];
                const firstContact = safeContacts[0] || {};
                const relation = getLeadRelation(lead, { currentUser, isAdmin });
                const prevRelation = index > 0 ? getLeadRelation(sortedLeads[index - 1], { currentUser, isAdmin }) : null;
                const relationsOnPage = new Set(sortedLeads.map(l => getLeadRelation(l, { currentUser, isAdmin })));
                const showGrouping = !isAdmin && !!currentUser && (relationsOnPage.has('createdByMe') || relationsOnPage.has('unrelated'));
                const showHeader = showGrouping && relation !== prevRelation;
                const relationBadge = getLeadRelationBadge(lead, { currentUser, isAdmin });
                const headerClass =
                  relation === 'mine'
                    ? 'bg-emerald-50 text-emerald-800'
                    : relation === 'createdByMe'
                      ? 'bg-sky-100 text-sky-900'
                      : 'bg-amber-100 text-amber-900';
                const rowClass = selectedLeads.includes(lead.id)
                  ? 'bg-indigo-50 border-l-indigo-500'
                  : relation === 'mine'
                    ? `hover:bg-slate-50 ${showGrouping ? 'border-l-emerald-400 bg-white' : 'border-l-transparent'}`
                    : relation === 'createdByMe'
                      ? 'bg-sky-50 hover:bg-sky-100 border-l-sky-500'
                      : 'bg-amber-50 hover:bg-amber-100 border-l-amber-500';
                
                return (
                  <React.Fragment key={lead.id}>
                  {showHeader && (
                    <tr className={headerClass}>
                      <td colSpan={visibleColumns.length} className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide">
                        {LEAD_RELATION_HEADERS[relation]}
                      </td>
                    </tr>
                  )}
                  <tr
                    className={`cursor-pointer border-l-4 ${rowClass}`}
                    onClick={() => onSelectLead(lead)}
                  >
                    {visibleColumns.map(column => {
                      // Check if this column should prevent row click
                      const isClickableColumn = column.id === 'followUps' || column.id === 'nextAction';
                        return (
                        <td
                          key={column.id}
                          className={`${column.width} px-0.5 sm:px-1 py-0.5 sm:py-1 text-[10px] sm:text-xs border-r border-slate-100 last:border-r-0 overflow-hidden min-w-0`}
                          onClick={isClickableColumn ? (e) => e.stopPropagation() : undefined}
                        >
                        {column.id === 'select' && (
                          <input
                            type="checkbox"
                            checked={selectedLeads.includes(lead.id)}
                            onChange={(e) => {
                              e.stopPropagation();
                              onToggleLeadSelection(lead.id);
                            }}
                            className="lead-list-checkbox rounded border-slate-300 h-3 w-3 sm:h-4 sm:w-4"
                          />
                        )}
                        
                        {column.id === 'agencyName' && (
                          <div className="truncate" title={lead.agencyName}>
                            <div className="font-medium text-slate-900 text-xs flex items-center gap-1">
                              {lead.agencyName}
                              {(() => {
                                // 🟢 SAFE FIX: Force it to be an array
                                const rawInterest = lead.countryInterest;
                                const countryInterest = Array.isArray(rawInterest) ? rawInterest : ['Canada'];

                                const flagMap: Record<string, string> = {
                                  'Canada': '🇨🇦',
                                  'UK': '🇬🇧',
                                  'USA': '🇺🇸'
                                };
                                
                                return (
                                  <span className="flex items-center gap-0.5" title={countryInterest.join(' → ')}>
                                    {countryInterest.map((country, idx) => (
                                      <span key={idx} className="text-xs">
                                        {flagMap[country] || country}
                                      </span>
                                    ))}
                                  </span>
                                );
                              })()}
                            </div>
                            <div className="text-xs text-slate-500 mt-0.5">
                              {lead.accountManager && (
                                <span className="inline-block mr-2 px-1.5 py-0.5 bg-orange-100 text-orange-800 rounded-full text-xs font-medium">
                                  AM: {getUserDisplayNameLocal(lead.accountManager)}
                                </span>
                              )}
                              {relationBadge && (
                                <span className={`inline-block mr-2 px-1.5 py-0.5 rounded-full text-xs font-semibold ${relationBadge.className}`}>
                                  {relationBadge.label}
                                </span>
                              )}
                              <span className={`inline-flex px-1.5 py-0.5 text-xs font-medium rounded-full ${getCategoryColor(lead.agentCategory)}`}>
                                {lead.agentCategory}
                              </span>
                            </div>
                          </div>
                        )}
                        
                        {column.id === 'status' && (
                          <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(lead.status)}`}>
                            {lead.status}
                          </span>
                        )}
                        
                        {column.id === 'icpScore' && (
                          <div className="text-center">
                            {lead.icpScore !== undefined && lead.icpScore !== null ? (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedLeadForIcp(lead);
                                  setShowIcpScoreModal(true);
                                }}
                                className="inline-flex items-center justify-center px-2 py-1 text-xs font-semibold rounded-full bg-indigo-100 text-indigo-800 min-w-[2rem] hover:bg-indigo-200 cursor-pointer transition-colors"
                                title="Click to view ICP Score details"
                              >
                                🎯 {lead.icpScore}/10
                              </button>
                            ) : (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedLeadForIcp(lead);
                                  setShowIcpScoreModal(true);
                                }}
                                className="inline-flex items-center justify-center px-2 py-1 text-xs font-medium rounded-full bg-slate-100 text-slate-500 min-w-[2rem] hover:bg-slate-200 cursor-pointer transition-colors"
                                title="Click to set ICP Score"
                              >
                                NA
                              </button>
                            )}
                          </div>
                        )}
                        
                        {column.id === 'leadSource' && (
                          <span className="inline-flex px-2 py-1 text-xs font-medium rounded-full bg-purple-100 text-purple-800">
                            {lead.leadSource || 'Website'}
                          </span>
                        )}
                        
                        {column.id === 'contact' && (
                          <div className="flex flex-col gap-1">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedLeadContacts(lead);
                                setShowContactPopup(true);
                              }}
                              className="text-slate-900 text-xs font-medium hover:text-blue-600 hover:underline text-left truncate"
                              title={`View all contacts for ${lead.agencyName}`}
                            >
                              {firstContact.name || 'N/A'}
                            </button>
                            <div className="flex items-center gap-1">
                              {firstContact.phone && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                    if (currentUser) {
                                      trackCallAction(
                                        currentUser,
                                        getUserDisplayNameLocal(currentUser),
                                        firstContact.phone || '',
                                        lead.id,
                                        lead.agencyName,
                                        firstContact.name,
                                        lead.agencyName
                                      );
                                    }
                                    window.open(`tel:${firstContact.phone}`, '_self');
                                }}
                                className="p-1 text-green-600 hover:text-green-800 hover:bg-green-100 rounded"
                                title={`Call ${firstContact.phone}`}
                              >
                                📞
                              </button>
                              )}
                              {firstContact.email && (
                                <EmailLinkIconCompact 
                                  email={firstContact.email || ''}
                                  recipientName={firstContact.name}
                                  agencyName={lead.agencyName}
                                  currentUser={currentUser}
                                  leadId={lead.id}
                                  leadName={lead.agencyName}
                                  getUserDisplayNameLocal={getUserDisplayNameLocal}
                                />
                              )}
                              {firstContact.phone && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (currentUser) {
                                      trackWhatsAppAction(
                                        currentUser,
                                        getUserDisplayNameLocal(currentUser),
                                        firstContact.phone || '',
                                        lead.id,
                                        lead.agencyName,
                                        firstContact.name,
                                        lead.agencyName
                                      );
                                    }
                                    const message = `Hi ${firstContact.name}, I hope you're doing well. I wanted to reach out regarding our business discussion.`;
                                    try {
                                      const whatsappUrl = createWhatsAppUrl(firstContact.phone || '', message);
                                      window.open(whatsappUrl, '_blank');
                                    } catch (error) {
                                      alert('Invalid phone number.');
                                    }
                                  }}
                                  className="p-1 text-green-500 hover:text-green-700 hover:bg-green-100 rounded"
                                  title={`WhatsApp ${firstContact.phone}`}
                                >
                                  <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893A11.821 11.821 0 0020.885 3.488"/>
                                  </svg>
                                </button>
                              )}
                            </div>
                          </div>
                        )}
                        
                        {column.id === 'phone' && (
                          <div className="text-slate-600" title={firstContact.phone}>
                            {formatPhone(firstContact.phone || '')}
                          </div>
                        )}
                        
                        {column.id === 'onboardedDate' && (
                          <div className="text-slate-600 truncate" title={lead.onboardingDate ? new Date(lead.onboardingDate).toLocaleDateString() : 'Not onboarded'}>
                            {lead.onboardingDate ? formatDate(lead.onboardingDate) : 'N/A'}
                          </div>
                        )}
                        
                        {column.id === 'onboardingDate' && (
                          <div className="text-slate-600 truncate" title={lead.onboardingDate ? new Date(lead.onboardingDate).toLocaleDateString() : 'Not set'}>
                            {(() => {
                              if (lead.onboardingDate) {
                                try {
                                  const date = new Date(lead.onboardingDate);
                                  return isNaN(date.getTime()) ? 'Invalid date' : date.toLocaleDateString('en-US', {
                                    year: 'numeric',
                                    month: 'short',
                                    day: 'numeric'
                                  });
                                } catch (error) {
                                  return 'Invalid date';
                                }
                              }
                              return 'N/A';
                            })()}
                          </div>
                        )}
                        
                        {column.id === 'remarks' && (
                          <div className="text-slate-600 truncate" title={lead.remarks || 'No remarks'}>
                            {lead.remarks && lead.remarks.trim() ? (
                              lead.remarks.length > 20 ? lead.remarks.substring(0, 20) + '...' : lead.remarks
                            ) : 'N/A'}
                          </div>
                        )}
                        
                        {column.id === 'city' && (
                          <div className="text-slate-600 truncate" title={firstContact.city}>
                            {(() => {
                              const cityData = firstContact.city || 'N/A';
                              if (cityData.includes(',') && cityData.length > 20) {
                                const parts = cityData.split(',');
                                return parts[parts.length - 1].trim();
                              }
                              if (cityData.length > 15) {
                                return cityData.substring(0, 15) + '...';
                              }
                              return cityData;
                            })()}
                          </div>
                        )}
                        
                        
                        {column.id === 'salesPerson' && (
                          <div className="text-slate-600 truncate" title={lead.salesPerson}>
                            {getUserDisplayNameLocal(lead.salesPerson || '')}
                          </div>
                        )}
                        
                        {column.id === 'createdBy' && (
                          <div className="text-slate-600 truncate" title={lead.createdBy}>
                            {getUserDisplayNameLocal(lead.createdBy)}
                          </div>
                        )}
                        
                        {column.id === 'createdAt' && (
                          <div className="text-slate-600">
                            {formatDate(lead.createdAt)}
                          </div>
                        )}
                        
                        {column.id === 'followUps' && (
                          <div 
                            className={`text-slate-600 ${safeFollowUps.length > 0 ? 'cursor-pointer hover:text-indigo-600 hover:underline' : ''}`}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              if (safeFollowUps.length > 0) {
                                onSelectLead(lead, 'FOLLOWUPS_TAB');
                              }
                            }}
                            onMouseDown={(e) => e.stopPropagation()}
                            title={safeFollowUps.length > 0 ? "Click to view all follow-ups" : "No follow-ups"}
                          >
                            {safeFollowUps.length > 0 ? (
                              <div>
                                <div className="text-xs font-medium">
                                  {safeFollowUps.length} follow-up{safeFollowUps.length !== 1 ? 's' : ''}
                                </div>
                                {/* 🟢 SAFE FIX: Use slice on safe array */}
                                {safeFollowUps.slice(0, 2).map((followUp, index) => {
                                  const date = new Date(followUp.date);
                                  const missed = isMissedFollowUp(followUp);
                                  return (
                                    <div key={index} className={`text-xs mt-0.5 ${missed ? 'text-red-600 font-semibold' : 'text-slate-500'}`}>
                                      {followUp.type} - {date.toLocaleDateString()} {date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </div>
                                  );
                                })}
                                {safeFollowUps.length > 2 && (
                                  <div className="text-xs text-slate-400 mt-0.5">
                                    +{safeFollowUps.length - 2} more
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div className="text-xs text-slate-400">No follow-ups</div>
                            )}
                          </div>
                        )}
                        
                        {column.id === 'nextAction' && (
                          <div 
                            className={`text-slate-600 ${(() => {
                              const nextAction = getNextAction(lead);
                              return nextAction.action !== 'No follow-ups' ? 'cursor-pointer hover:text-indigo-600 hover:underline' : '';
                            })()}`}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              const nextAction = getNextAction(lead);
                              if (nextAction.action !== 'No follow-ups' && safeFollowUps.length > 0) {
                                // 🟢 SAFE FIX: Safe filtering
                                const upcomingFollowUps = safeFollowUps
                                  .filter(fu => fu.status === 'Planned')
                                  .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
                                
                                const nextFollowUpId = upcomingFollowUps.length > 0 
                                  ? upcomingFollowUps[0].id 
                                  : [...safeFollowUps].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0]?.id;
                                
                                if (nextFollowUpId) {
                                  onSelectLead(lead, nextFollowUpId);
                                } else {
                                  onSelectLead(lead, '');
                                }
                              }
                            }}
                            onMouseDown={(e) => e.stopPropagation()}
                            title={(() => {
                              const nextAction = getNextAction(lead);
                              return nextAction.action !== 'No follow-ups' ? "Click to view/edit this follow-up" : "No follow-ups";
                            })()}
                          >
                            {(() => {
                              const nextAction = getNextAction(lead);
                              return (
                                <div>
                                  <div className="text-xs font-medium text-slate-800">
                                    {nextAction.action}
                                  </div>
                                  {nextAction.date && (
                                    <div className={`text-xs mt-0.5 ${nextAction.isMissed ? 'text-red-600 font-semibold' : 'text-slate-500'}`}>
                                      {nextAction.date} {nextAction.time}
                                    </div>
                                  )}
                                </div>
                              );
                            })()}
                          </div>
                        )}
                        
                        {column.id === 'actions' && (
                          <div className="flex items-center gap-0.5 sm:gap-1 lead-row-actions" onClick={(e) => e.stopPropagation()}>
                            <button
                              onClick={() => onSelectLead(lead)}
                              className="lead-row-action p-1 text-indigo-600 hover:text-indigo-800 hover:bg-indigo-100 rounded min-w-0"
                              title="View Details"
                            >
                              👁️
                            </button>
                            {isAdmin && canMutateLead(lead, { currentUser, isAdmin }) && availableUsers.length > 0 && (
                              <button
                                onClick={() => {
                          const accountManagerOptions = availableUsers
                            .filter(user => user.role === 'Account Manager' || user.role === 'Admin' || user.role === 'SubAdmin')
                            .map(user => `<option value="${user.email}">${user.name} (${user.role})</option>`)
                            .join('');
                          
                          const salesPersonOptions = availableUsers
                            .filter(user => user.role === 'Sales' || user.role === 'Admin' || user.role === 'SubAdmin')
                            .map(user => `<option value="${user.email}">${user.name} (${user.role})</option>`)
                            .join('');
                                  
                                  const dialog = document.createElement('div');
                                  dialog.innerHTML = `
                                    <div style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); z-index: 1000; display: flex; align-items: center; justify-content: center;">
                                      <div style="background: white; padding: 20px; border-radius: 8px; min-width: 400px;">
                                        <h3 style="margin: 0 0 15px 0; font-size: 18px; font-weight: bold;">Assign Lead: ${lead.agencyName}</h3>
                                        <div style="margin-bottom: 15px;">
                                          <label style="display: block; margin-bottom: 5px; font-weight: 500;">Account Manager:</label>
                                          <select id="accountManagerSelect" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px;">
                                            <option value="">Select Account Manager</option>
                                            ${accountManagerOptions}
                                          </select>
                                        </div>
                                        <div style="margin-bottom: 20px;">
                                          <label style="display: block; margin-bottom: 5px; font-weight: 500;">Sales Person:</label>
                                          <select id="salesPersonSelect" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px;">
                                            <option value="">Select Sales Person</option>
                                            ${salesPersonOptions}
                                          </select>
                                        </div>
                                        <div style="display: flex; gap: 10px; justify-content: flex-end;">
                                          <button id="cancelBtn" style="padding: 8px 16px; border: 1px solid #ccc; background: white; border-radius: 4px; cursor: pointer;">Cancel</button>
                                          <button id="assignBtn" style="padding: 8px 16px; background: #4f46e5; color: white; border: none; border-radius: 4px; cursor: pointer;">Assign Lead</button>
                                        </div>
                                      </div>
                                    </div>
                                  `;
                                  
                                  document.body.appendChild(dialog);
                                  
                                  const accountManagerSelect = dialog.querySelector('#accountManagerSelect') as HTMLSelectElement;
                                  const salesPersonSelect = dialog.querySelector('#salesPersonSelect') as HTMLSelectElement;
                                  accountManagerSelect.value = lead.accountManager || '';
                                  salesPersonSelect.value = lead.salesPerson || '';
                                  
                                  dialog.querySelector('#cancelBtn')?.addEventListener('click', () => {
                                    document.body.removeChild(dialog);
                                  });
                                  
                                  dialog.querySelector('#assignBtn')?.addEventListener('click', () => {
                                    const newAccountManager = accountManagerSelect.value;
                                    const newSalesPerson = salesPersonSelect.value;
                                    
                                    if (newAccountManager && newSalesPerson) {
                                      onAssignLead?.(lead.id, newAccountManager, newSalesPerson);
                                      document.body.removeChild(dialog);
                                    } else {
                                      alert('Please select both Account Manager and Sales Person');
                                    }
                                  });
                                }}
                                className="lead-row-action p-1 text-green-600 hover:text-green-800 hover:bg-green-100 rounded min-w-0"
                                title="Assign Lead"
                              >
                                🔄
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                      );
                    })}
                  </tr>
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile View - Field Team Optimized */}
      <div className="md:hidden mt-4">
        <div className="space-y-4">
          {sortedLeads.map((lead, index) => {
             // 🟢 SAFE FIX: Pre-calculate safe lists for Mobile
             const safeContacts = Array.isArray(lead.contacts) ? lead.contacts : [];
             const safeFollowUps = Array.isArray(lead.followUps) ? lead.followUps : [];
             const firstContact = safeContacts[0] || {};
             const relation = getLeadRelation(lead, { currentUser, isAdmin });
             const prevRelation = index > 0 ? getLeadRelation(sortedLeads[index - 1], { currentUser, isAdmin }) : null;
             const relationsOnPage = new Set(sortedLeads.map(l => getLeadRelation(l, { currentUser, isAdmin })));
             const showGrouping = !isAdmin && !!currentUser && (relationsOnPage.has('createdByMe') || relationsOnPage.has('unrelated'));
             const showHeader = showGrouping && relation !== prevRelation;
             const relationBadge = getLeadRelationBadge(lead, { currentUser, isAdmin });
             const headerClass =
               relation === 'mine'
                 ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                 : relation === 'createdByMe'
                   ? 'bg-sky-100 border-sky-300 text-sky-900'
                   : 'bg-amber-100 border-amber-300 text-amber-900';
             const cardClass =
               relation === 'createdByMe'
                 ? 'bg-sky-50 border-2 border-sky-300'
                 : relation === 'unrelated'
                   ? 'bg-amber-50 border-2 border-amber-300'
                   : 'bg-white border border-slate-200';
             
             return (
            <React.Fragment key={lead.id}>
            {showHeader && (
              <div className={`px-3 py-2 rounded-lg border text-xs font-semibold uppercase tracking-wide ${headerClass}`}>
                {LEAD_RELATION_HEADERS[relation]}
              </div>
            )}
            <div
              className={`rounded-xl shadow-sm hover:shadow-md transition-all duration-200 ${cardClass}`}
            >
              {/* Header with Agency Name and Status */}
              <div className="p-4 border-b border-slate-100">
                <div className="flex items-start justify-between mb-2">
                  {isAdmin && (
                    <input
                      type="checkbox"
                      checked={selectedLeads.includes(lead.id)}
                      onChange={(e) => {
                        e.stopPropagation();
                        onToggleLeadSelection(lead.id);
                      }}
                      className="lead-list-checkbox rounded border-slate-300 flex-shrink-0 mt-1 h-3 w-3 sm:h-4 sm:w-4"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-slate-900 text-lg leading-tight mb-2">{lead.agencyName}</h3>
                    <div className="flex flex-wrap gap-2 mb-2">
                      <span className={`inline-flex px-3 py-1 text-sm font-semibold rounded-full ${getStatusColor(lead.status)}`}>
                        {lead.status}
                      </span>
                      <span className="inline-flex px-3 py-1 text-sm font-semibold rounded-full bg-purple-100 text-purple-800">
                        {lead.leadSource || 'Website'}
                      </span>
                    </div>
                    {lead.accountManager && (
                      <div className="text-sm text-slate-600">
                        <span className="inline-block px-2 py-1 bg-orange-100 text-orange-800 rounded-full text-xs font-medium">
                          AM: {getUserDisplayNameLocal(lead.accountManager)}
                        </span>
                      </div>
                    )}
                    {relationBadge && (
                      <span className={`inline-block mt-2 px-2 py-1 rounded-full text-xs font-semibold ${relationBadge.className}`}>
                        {relationBadge.label}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Contact Information - Prominent Display */}
              <div className="p-4 bg-gradient-to-r from-blue-50 to-indigo-50">
                <div className="text-base font-semibold text-blue-800 mb-3">📞 Contact Information</div>
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                      <span className="text-green-600 text-lg">📞</span>
                    </div>
                    <div className="flex-1">
                      <div className="text-sm text-slate-600">Primary Phone</div>
                      <div className="font-semibold text-slate-900">{formatPhone(firstContact.phone || '')}</div>
                    </div>
                  </div>
                  
                  {firstContact.email && (
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                        <span className="text-blue-600 text-lg">📧</span>
                      </div>
                      <div className="flex-1">
                        <div className="text-sm text-slate-600">Email</div>
                        <div className="font-semibold text-slate-900 text-sm">{formatEmail(firstContact.email || '')}</div>
                      </div>
                    </div>
                  )}
                  
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center">
                      <span className="text-slate-600 text-lg">📍</span>
                    </div>
                    <div className="flex-1">
                      <div className="text-sm text-slate-600">Location</div>
                      <div className="font-semibold text-slate-900">{firstContact.city || 'N/A'}</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Quick Action Buttons - Full Width */}
              <div className="p-4">
                <div className="text-base font-semibold text-blue-800 mb-3">⚡ Quick Actions</div>
                <div className="space-y-2">
                  {firstContact.phone && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                                  // Track call action
                                  if (currentUser) {
                                    trackCallAction(
                                      currentUser,
                            getUserDisplayNameLocal(currentUser),
                            firstContact.phone || '',
                            lead.id,
                            lead.agencyName,
                            firstContact.name,
                            lead.agencyName
                          );
                        }
                        window.open(`tel:${firstContact.phone}`, '_self');
                      }}
                      className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-green-600 text-white rounded-xl text-base font-semibold hover:bg-green-700 transition-colors shadow-sm"
                    >
                      <span className="text-xl">📞</span>
                      <span>Call Now</span>
                    </button>
                  )}
                  
                  {firstContact.phone && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        // Track WhatsApp action
                        if (currentUser) {
                          trackWhatsAppAction(
                            currentUser,
                            getUserDisplayNameLocal(currentUser),
                            firstContact.phone || '',
                            lead.id,
                            lead.agencyName,
                            firstContact.name,
                            lead.agencyName
                          );
                        }
                        const message = `Hi ${firstContact.name}, I hope you're doing well. I wanted to reach out regarding our business discussion.



Regards

Team 

Iapply.io`;
                        try {
                          const whatsappUrl = createWhatsAppUrl(firstContact.phone || '', message);
                          window.open(whatsappUrl, '_blank');
                        } catch (error) {
                          alert('Invalid phone number.');
                        }
                      }}
                      className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-green-500 text-white rounded-xl text-base font-semibold hover:bg-green-600 transition-colors shadow-sm"
                    >
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893A11.821 11.821 0 0020.885 3.488"/>
                      </svg>
                      <span>WhatsApp</span>
                    </button>
                  )}
                  
                  {firstContact.email && (
                    <EmailButtonMobile 
                      email={firstContact.email || ''}
                      recipientName={firstContact.name}
                      agencyName={lead.agencyName}
                      currentUser={currentUser}
                      leadId={lead.id}
                      leadName={lead.agencyName}
                      getUserDisplayNameLocal={getUserDisplayNameLocal}
                    />
                  )}
                  
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectLead(lead);
                    }}
                    className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-indigo-600 text-white rounded-xl text-base font-semibold hover:bg-indigo-700 transition-colors shadow-sm"
                  >
                    <span className="text-xl">👁️</span>
                    <span>View Full Details</span>
                  </button>
                </div>
              </div>

              {/* Follow-up Information */}
              <div className="p-4 bg-slate-50 border-t border-slate-200">
                <div className="text-base font-semibold text-blue-800 mb-3">📋 Follow-up Status</div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-600">Total Follow-ups:</span>
                    <span className="font-semibold text-slate-900">{safeFollowUps.length}</span>
                  </div>
                  
                  {(() => {
                    const nextAction = getNextAction(lead);
                    return (
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-slate-600">Next Action:</span>
                        <div className="text-right">
                          <div className="font-semibold text-slate-900 text-sm">{nextAction.action}</div>
                          {nextAction.date && (
                            <div className={`text-xs ${nextAction.isMissed ? 'text-red-600 font-semibold' : 'text-slate-500'}`}>{nextAction.date} {nextAction.time}</div>
                          )}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>

              {/* Footer with Creation Info */}
              <div className="px-4 py-3 bg-slate-100 border-t border-slate-200 rounded-b-xl">
                <div className="flex items-center justify-between text-sm text-slate-600">
                  <span>Created: {new Date(lead.createdAt).toLocaleDateString()}</span>
                  <span>By: {getUserDisplayNameLocal(lead.createdBy)}</span>
                </div>
              </div>
            </div>
            </React.Fragment>
             );
           })}
        </div>
      </div>

      {/* Contact Details Popup */}
      {showContactPopup && selectedLeadContacts && (() => {
        // 🟢 SAFE FIX: Pre-calculate safe lists for Contact Popup
        const safeContacts = Array.isArray(selectedLeadContacts.contacts) ? selectedLeadContacts.contacts : [];
        return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold text-blue-800">
                  Contact Details - {selectedLeadContacts.agencyName}
                </h3>
                <button
                  onClick={() => setShowContactPopup(false)}
                  className="text-slate-400 hover:text-slate-600 text-xl"
                >
                  ×
                </button>
              </div>
              
              <div className="space-y-4">
                {safeContacts.map((contact, index) => (
                  <div key={index} className="border border-slate-200 rounded-lg p-4">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <h4 className="font-medium text-slate-900">
                          {contact.name || 'Unnamed Contact'}
                        </h4>
                        {contact.designation && (
                          <p className="text-sm text-slate-600">{contact.designation}</p>
                        )}
                      </div>
                      <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full">
                        {index === 0 ? 'Primary' : `Contact ${index + 1}`}
                      </span>
                    </div>
                    
                    <div className="space-y-2">
                      {contact.phone && (
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-slate-600 text-sm">📞</span>
                            <span className="text-slate-900 text-sm">{contact.phone}</span>
                          </div>
                          <div className="flex gap-1">
                            <button
                              onClick={() => {
                                  // Track call action
                                  if (currentUser) {
                                    trackCallAction(
                                      currentUser,
                                      getUserDisplayNameLocal(currentUser),
                                      contact.phone || '',
                                      selectedLeadContacts?.id,
                                      selectedLeadContacts?.agencyName,
                                      contact.name,
                                      selectedLeadContacts?.agencyName
                                    );
                                  }
                                  window.open(`tel:${contact.phone}`, '_self');
                              }}
                              className="px-3 py-1 bg-green-600 text-white text-xs rounded hover:bg-green-700"
                            >
                              Call
                            </button>
                            <button
                              onClick={() => {
                                // Track WhatsApp action
                                if (currentUser) {
                                  trackWhatsAppAction(
                                    currentUser,
                                    getUserDisplayNameLocal(currentUser),
                                    contact.phone || '',
                                    selectedLeadContacts?.id,
                                    selectedLeadContacts?.agencyName,
                                    contact.name,
                                    selectedLeadContacts?.agencyName
                                  );
                                }
                                const message = `Hi ${contact.name}, I hope you're doing well. I wanted to reach out regarding our business discussion.



Regards

Team 

Iapply.io`;
                                try {
                                  const whatsappUrl = createWhatsAppUrl(contact.phone || '', message);
                                  window.open(whatsappUrl, '_blank');
                                } catch (error) {
                                  alert('Invalid phone number.');
                                }
                              }}
                              className="px-3 py-1 bg-green-500 text-white text-xs rounded hover:bg-green-600"
                            >
                              WhatsApp
                            </button>
                          </div>
                        </div>
                      )}
                      
                      {contact.email && (
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-slate-600 text-sm">📧</span>
                            <span className="text-slate-900 text-sm">{contact.email}</span>
                          </div>
                          <EmailButtonContact 
                            email={contact.email || ''}
                            recipientName={contact.name}
                            agencyName={selectedLeadContacts?.agencyName}
                            currentUser={currentUser}
                            leadId={selectedLeadContacts?.id || ''}
                            leadName={selectedLeadContacts?.agencyName || ''}
                            getUserDisplayNameLocal={getUserDisplayNameLocal}
                          />
                        </div>
                      )}
                      
                      {contact.alternateMobile && (
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-slate-600 text-sm">📱</span>
                            <span className="text-slate-900 text-sm">{contact.alternateMobile}</span>
                          </div>
                          <div className="flex gap-1">
                            <button
                              onClick={() => {
                                  // Track call action
                                  if (currentUser) {
                                    trackCallAction(
                                      currentUser,
                                      getUserDisplayNameLocal(currentUser),
                                      contact.alternateMobile || '',
                                      selectedLeadContacts?.id,
                                      selectedLeadContacts?.agencyName,
                                      contact.name,
                                      selectedLeadContacts?.agencyName
                                    );
                                  }
                                  window.open(`tel:${contact.alternateMobile}`, '_self');
                              }}
                              className="px-3 py-1 bg-green-600 text-white text-xs rounded hover:bg-green-700"
                            >
                              Call
                            </button>
                            <button
                              onClick={() => {
                                // Track WhatsApp action
                                if (currentUser) {
                                  trackWhatsAppAction(
                                    currentUser,
                                    getUserDisplayNameLocal(currentUser),
                                    contact.alternateMobile || '',
                                    selectedLeadContacts?.id,
                                    selectedLeadContacts?.agencyName,
                                    contact.name,
                                    selectedLeadContacts?.agencyName
                                  );
                                }
                                const message = `Hi ${contact.name}, I hope you're doing well. I wanted to reach out regarding our business discussion.



Regards

Team 

Iapply.io`;
                                try {
                                  const whatsappUrl = createWhatsAppUrl(contact.alternateMobile || '', message);
                                  window.open(whatsappUrl, '_blank');
                                } catch (error) {
                                  alert('Invalid phone number.');
                                }
                              }}
                              className="px-3 py-1 bg-green-500 text-white text-xs rounded hover:bg-green-600"
                            >
                              WhatsApp
                            </button>
                          </div>
                        </div>
                      )}
                      
                      {contact.city && (
                        <div className="flex items-center gap-2">
                          <span className="text-slate-600 text-sm">📍</span>
                          <span className="text-slate-900 text-sm">{contact.city}</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              
              <div className="mt-6 flex justify-end">
                <button
                  onClick={() => setShowContactPopup(false)}
                  className="px-4 py-2 bg-slate-100 text-slate-700 rounded hover:bg-slate-200"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
        );
      })()}
      
      {showIcpScoreModal && selectedLeadForIcp && (
        <IcpScoringModal
          onClose={() => {
                    setShowIcpScoreModal(false);
            setSelectedLeadForIcp(null);
            setCategoryScores(emptyIcpCategoryScores());
          }}
          categoryScores={categoryScores}
          onCategoryScoreChange={(category, value) => {
            setCategoryScores((prev) => ({ ...prev, [category]: value }));
          }}
          applyDisabled={!canMutateLead(selectedLeadForIcp, { currentUser, isAdmin })}
          onApply={async (score) => {
            const nextScore = clampIcpScore(score);
            if (!canMutateLead(selectedLeadForIcp, { currentUser, isAdmin })) {
                        alert('You can view this lead but only the current Account Manager can edit it.');
                        return;
                      }
            if (!onUpdateLead) {
              alert(`ICP Score would be updated to ${nextScore}/10. Please update the lead manually.`);
              setShowIcpScoreModal(false);
              setSelectedLeadForIcp(null);
              return;
            }
            try {
              await onUpdateLead(selectedLeadForIcp.id, { icpScore: nextScore });
              alert(`ICP Score updated to ${nextScore}/10`);
                          setShowIcpScoreModal(false);
              setSelectedLeadForIcp(null);
              setCategoryScores(emptyIcpCategoryScores());
                        } catch (error) {
              alert(`Failed to update ICP Score: ${error}`);
            }
          }}
          banner={(
            <div className="bg-indigo-600 text-white rounded-xl p-3 sm:p-4 mb-3">
              <p className="font-bold text-lg truncate">{selectedLeadForIcp.agencyName}</p>
              <div className="mt-2 flex flex-wrap gap-2 text-xs sm:text-sm">
                <span className="px-2 py-1 bg-white/20 rounded-full">{selectedLeadForIcp.status}</span>
                {selectedLeadForIcp.agentCategory && (
                  <span className="px-2 py-1 bg-white/20 rounded-full">{selectedLeadForIcp.agentCategory}</span>
                )}
                <span className="px-2 py-1 bg-white/20 rounded-full font-semibold">
                  Current: {selectedLeadForIcp.icpScore !== undefined && selectedLeadForIcp.icpScore !== null ? `${selectedLeadForIcp.icpScore}/10` : 'Not set'}
                </span>
              </div>
            </div>
          )}
        />
      )}
    </div>
  );
};