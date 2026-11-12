import apiClient from './apiClient';
import { setLocationMasterOverrides } from '../utils/locationSuggest';

export type LocationStateRow = {
  id: string;
  country: string;
  name: string;
  isActive?: boolean;
};

export type LocationCityRow = {
  id: string;
  country: string;
  state: string;
  name: string;
  isActive?: boolean;
};

export type LocationBundle = {
  statesByCountry: Record<string, string[]>;
  cityToState: Record<string, string>;
  states: LocationStateRow[];
  cities: LocationCityRow[];
};

let loadedOnce = false;

export async function fetchLocationBundle(applyOverrides = true): Promise<LocationBundle> {
  const { data } = await apiClient.get<LocationBundle>('/location-master/bundle');
  if (applyOverrides && data) {
    setLocationMasterOverrides({
      statesByCountry: data.statesByCountry || {},
      cityToState: data.cityToState || {},
    });
    loadedOnce = true;
  }
  return data;
}

export async function ensureLocationMasterLoaded(): Promise<void> {
  if (loadedOnce) return;
  try {
    await fetchLocationBundle(true);
  } catch (error) {
    console.warn('Location master load failed; using built-in maps.', error);
  }
}

export async function listLocationStates(params: { country?: string; q?: string } = {}) {
  const { data } = await apiClient.get<LocationStateRow[]>('/location-master/states', { params });
  return data || [];
}

export async function saveLocationState(payload: Partial<LocationStateRow> & { country: string; name: string }) {
  if (payload.id) {
    const { data } = await apiClient.put(`/location-master/states/${payload.id}`, payload);
    return data;
  }
  const { data } = await apiClient.post('/location-master/states', payload);
  return data;
}

export async function deleteLocationState(id: string) {
  const { data } = await apiClient.delete(`/location-master/states/${id}`);
  return data;
}

export async function listLocationCities(params: { country?: string; state?: string; q?: string } = {}) {
  const { data } = await apiClient.get<LocationCityRow[]>('/location-master/cities', { params });
  return data || [];
}

export async function saveLocationCity(
  payload: Partial<LocationCityRow> & { country: string; state: string; name: string; syncLeads?: boolean }
) {
  if (payload.id) {
    const { data } = await apiClient.put(`/location-master/cities/${payload.id}`, payload);
    return data;
  }
  const { data } = await apiClient.post('/location-master/cities', payload);
  return data;
}

export async function deleteLocationCity(id: string) {
  const { data } = await apiClient.delete(`/location-master/cities/${id}`);
  return data;
}
