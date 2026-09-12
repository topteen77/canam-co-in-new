import { useCallback, useEffect, useState } from 'react';
import apiClient from '../services/apiClient';

export interface MeetingAlert {
  id: string;
  meetingId: string;
  userEmail: string;
  userName: string;
  leadId?: string;
  leadName?: string;
  alertType: 'left_place' | 'meeting_ended' | 'returned_place' | string;
  distanceM?: number;
  meetingAddress?: string;
  currentAddress?: string;
  currentLat?: number;
  currentLng?: number;
  createdAt: string;
}

export function useAdminMeetingAlerts(isAdmin: boolean) {
  const [alerts, setAlerts] = useState<MeetingAlert[]>([]);

  const load = useCallback(async () => {
    if (!isAdmin) {
      setAlerts([]);
      return;
    }
    try {
      const { data } = await apiClient.get('/admin/meeting-alerts');
      setAlerts(Array.isArray(data) ? data : []);
    } catch {
      // Admin endpoint may be unavailable until API restart
    }
  }, [isAdmin]);

  useEffect(() => {
    load();
    if (!isAdmin) return;
    const timer = window.setInterval(load, 30000);
    return () => window.clearInterval(timer);
  }, [isAdmin, load]);

  return { alerts, refresh: load };
}
