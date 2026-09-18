import apiClient from './apiClient';
import type { Lead } from '../types';

const parseDate = (dateValue: any): any => {
  if (!dateValue) return null;
  if (typeof dateValue.toDate === 'function') return dateValue; 
  const dateObj = new Date(dateValue);
  return {
    toDate: () => dateObj,
    seconds: Math.floor(dateObj.getTime() / 1000),
    nanoseconds: 0,
    toString: () => dateObj.toISOString()
  };
};

const normalizeLead = (lead: any): Lead => {
  const a = lead.id, b = lead.firebase_id;
  const idStr = (a != null && String(a).trim() !== '' && String(a) !== 'null')
    ? String(a).trim()
    : (b != null && String(b).trim() !== '')
      ? String(b).trim()
      : String(a ?? b ?? '').trim();
  return {
    ...lead,
    id: idStr,
    agencyName: lead.agencyName || lead.agency_name,
    accountManager: lead.accountManager || lead.account_manager,
    salesPerson: lead.salesPerson || lead.sales_person,
    createdAt: parseDate(lead.createdAt || lead.created_at),
    updatedAt: parseDate(lead.updatedAt || lead.updated_at),
    tags: typeof lead.tags === 'string' ? JSON.parse(lead.tags || '[]') : (lead.tags || []),
    contacts: typeof lead.contacts === 'string' ? JSON.parse(lead.contacts || '[]') : (lead.contacts || []),
    followUps: typeof lead.followUps === 'string' ? JSON.parse(lead.followUps || '[]') : (lead.followUps || [])
  };
};

// --- GET ALL LEADS ---
export const getAllLeads = async (): Promise<Lead[]> => {
  try {
    const response = await apiClient.get('/leads/all');
    return (response.data || []).map(normalizeLead);
  } catch (error) {
    console.error('Error fetching leads:', error);
    return [];
  }
};

export const getLeadById = async (id: string): Promise<Lead | null> => {
  try {
    const response = await apiClient.get(`/leads/${encodeURIComponent(id)}`);
    return response.data ? normalizeLead(response.data) : null;
  } catch (error) {
    console.error('Error fetching lead:', error);
    return null;
  }
};

// --- Standard Functions ---
export const addLead = async (lead: Partial<Lead>) => {
  const res = await apiClient.post('/leads/add', lead);
  return res.data.id;
};
export const updateLead = async (id: string, updates: Partial<Lead>) => {
  try {
    await apiClient.put(`/leads/update/${id}`, updates);
  } catch (err: any) {
    const msg = err?.response?.data?.error || err?.message || 'Failed to update lead';
    throw new Error(msg);
  }
};
export const appendFollowUp = async (id: string, followUp: any) => {
  try {
    await apiClient.post(`/leads/${id}/followups`, { followUp });
  } catch (err: any) {
    const msg = err?.response?.data?.error || err?.message || 'Failed to add follow-up';
    throw new Error(msg);
  }
};
export const deleteLead = async (id: string) => {
  await apiClient.delete(`/leads/delete/${id}`);
};
export const subscribeToLeads = (callback: (leads: Lead[]) => void) => {
  getAllLeads()
    .then(callback)
    .catch((err) => {
      console.error('Leads subscription error:', err);
      callback([]);
    });
  return () => {};
};
export const getLeadsByAccountManager = async (manager: string) => {
    const leads = await getAllLeads();
    return leads.filter(l => l.accountManager === manager);
};