// Call API integration (Kommuno). Posts to /kommuno/click-to-call.
// Until the saved API test succeeds, the server returns fallback "tel" and the button opens the phone dialer.
import apiClient from './apiClient';

export async function placeCrmCall(input: {
  phone: string;
  leadId?: string;
  leadName?: string;
  contactName?: string;
  userEmail?: string | null;
}) {
  const phone = (input.phone || '').trim();
  if (!phone) return;
  try {
    const { data } = await apiClient.post('/kommuno/click-to-call', {
      customerNumber: phone,
      leadId: input.leadId || null,
      leadName: input.leadName || '',
      contactName: input.contactName || '',
      userEmail: input.userEmail || '',
    });
    if (data?.fallback === 'tel' || data?.configured === false) {
      window.open(`tel:${phone}`, '_self');
      return;
    }
    const who = input.contactName || input.leadName || phone;
    alert(`Call started to ${who}. Your Kommuno phone will ring first, then the customer.`);
  } catch (error: any) {
    const message = error?.response?.data?.error || error?.response?.data?.message;
    if (error?.response?.data?.fallback === 'tel') {
      window.open(`tel:${phone}`, '_self');
      return;
    }
    alert(message || 'Could not start the Kommuno call.');
  }
}
