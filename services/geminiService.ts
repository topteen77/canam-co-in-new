import type { Lead, FollowUpType } from '../types';
import type { ExtractedLeadData } from './ocrService';
import { prepareImageForVision } from '../utils/imageQuality';

let ai: any = null;

const getApiKey = (): string => {
  const key = (process.env.API_KEY || process.env.GEMINI_API_KEY || '').trim();
  if (!key || key === 'your_gemini_api_key_here' || key.length < 20) return '';
  return key;
};

export const isLLMConfigured = (): boolean => Boolean(getApiKey());

const initializeAI = async () => {
  if (ai) return ai;
  const apiKey = getApiKey();
  if (typeof window === 'undefined' || !apiKey) return null;

  try {
    const { GoogleGenAI } = await import('@google/genai');
    ai = new GoogleGenAI({ apiKey });
  } catch (error) {
    console.warn('GoogleGenAI not available:', error);
  }

  return ai;
};

const readModelText = (response: any): string => {
  if (!response) return '';
  if (typeof response.text === 'function') return String(response.text() || '');
  if (typeof response.text === 'string') return response.text;
  const parts = response?.candidates?.[0]?.content?.parts;
  if (Array.isArray(parts)) {
    return parts.map((part: any) => part?.text).filter(Boolean).join('\n');
  }
  return '';
};

const extractJson = (text: string): any | null => {
  if (!text) return null;
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced ? fenced[1] : trimmed).trim();
  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(candidate.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
};

const digitsOnly = (value?: string): string => (value || '').replace(/\D/g, '');

const normalizePhone = (value?: string): string | undefined => {
  const digits = digitsOnly(value);
  if (!digits) return undefined;
  if (digits.length >= 10) return digits.slice(-10);
  return digits;
};

const cleanField = (value?: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed && trimmed.toLowerCase() !== 'null' ? trimmed : undefined;
};

export type VisitingCardLLMResult = {
  isClearlyVisible: boolean;
  qualityIssues: string[];
  rawText: string;
  fields: ExtractedLeadData;
};

export const extractLeadFromImageWithLLM = async (imageFile: File): Promise<VisitingCardLLMResult> => {
  const aiInstance = await initializeAI();
  if (!aiInstance) {
    throw new Error('LLM_UNAVAILABLE');
  }

  const { base64, mimeType } = await prepareImageForVision(imageFile);

  const prompt = `You are reading a visiting card, business card, or office screenshot for a CRM form.
Return ONLY valid JSON. Do not invent values that are not clearly visible.

{
  "isClearlyVisible": true,
  "qualityIssues": [],
  "rawText": "all readable text from the image",
  "agencyName": "",
  "contactName": "",
  "pocDesignation": "",
  "phone": "",
  "alternateMobile": "",
  "email": "",
  "websiteLink": "",
  "address": "",
  "city": "",
  "state": "",
  "country": "",
  "remarks": ""
}

Rules:
- isClearlyVisible is false if the photo is blurry, dark, cropped, glare-heavy, or text cannot be read confidently. Then list issues in qualityIssues and leave fields empty except rawText.
- Extract company/agency name, person name, designation, phones, email, website, full address, city, state, country.
- phone and alternateMobile should be digits only (prefer last 10 digits for Indian numbers).
- email lowercase. websiteLink should include https:// if a site/domain is present.
- remarks can hold leftover useful text (tagline, GST, etc).`;

  const response = await aiInstance.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: [
      {
        role: 'user',
        parts: [
          { inlineData: { mimeType, data: base64 } },
          { text: prompt }
        ]
      }
    ],
    config: {
      temperature: 0.1,
      maxOutputTokens: 1200,
      responseMimeType: 'application/json'
    }
  });

  const text = readModelText(response).trim();
  const parsed = extractJson(text);
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('LLM_INVALID_RESPONSE');
  }

  const isClearlyVisible = parsed.isClearlyVisible !== false;
  const qualityIssues = Array.isArray(parsed.qualityIssues)
    ? parsed.qualityIssues.map((issue: unknown) => String(issue)).filter(Boolean)
    : [];

  const website = cleanField(parsed.websiteLink);
  const fields: ExtractedLeadData = {
    agencyName: cleanField(parsed.agencyName),
    contactName: cleanField(parsed.contactName),
    pocDesignation: cleanField(parsed.pocDesignation),
    phone: normalizePhone(cleanField(parsed.phone)),
    alternateMobile: normalizePhone(cleanField(parsed.alternateMobile)),
    email: cleanField(parsed.email)?.toLowerCase(),
    websiteLink: website && !/^https?:\/\//i.test(website) ? `https://${website}` : website,
    address: cleanField(parsed.address),
    city: cleanField(parsed.city),
    state: cleanField(parsed.state),
    country: cleanField(parsed.country),
    remarks: cleanField(parsed.remarks)
  };

  return {
    isClearlyVisible,
    qualityIssues,
    rawText: cleanField(parsed.rawText) || '',
    fields
  };
};

export const generateFollowUpSuggestion = async (lead: Lead, followUpType: FollowUpType): Promise<string> => {
  const aiInstance = await initializeAI();

  if (!aiInstance) {
    return `Follow up with ${lead.agencyName} regarding their ${lead.status?.toLowerCase?.() || ''} status. Check on their progress and next steps.`;
  }

  const history = (lead.followUps || [])
    .map((f: any) => `${f.type} on ${new Date(f.date).toLocaleDateString()}: ${f.notes}`)
    .join('\n');

  const prompt = `
    You are an expert assistant for a B2B partnership manager at a student recruitment company. 
    Your goal is to help draft concise, professional, and effective follow-up notes for potential partner agencies.

    Here is the lead's information:
    - Agency Name: ${lead.agencyName}
    - Current Status: ${lead.status}
    - Previous Interactions: ${history || 'None'}

    The manager wants to create a new follow-up of type: "${followUpType}".

    Based on this information, generate a brief, actionable note or objective for this B2B follow-up. 
    - For a 'Call', suggest a talking point or goal (e.g., discuss commission rates, explain our services).
    - For a 'Meeting', suggest an agenda item or objective (e.g., finalize partnership agreement, present marketing materials).
    - For an 'Email', draft a short, polite message body to advance the partnership discussion.

    Keep the suggestion to 1-2 sentences. Do not add any extra text or introductions.
  `;

  try {
    const response = await aiInstance.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        temperature: 0.8,
        maxOutputTokens: 100
      }
    });

    return readModelText(response).trim();
  } catch (error) {
    console.error('Error generating suggestion:', error);
    return `Follow up with ${lead.agencyName} regarding their ${lead.status?.toLowerCase?.() || ''} status. Check on their progress and next steps.`;
  }
};
