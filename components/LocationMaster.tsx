import React, { useEffect, useMemo, useState } from 'react';
import { CONTACT_COUNTRY_OPTIONS } from '../utils/countriesAndCities';
import {
  deleteLocationCity,
  deleteLocationState,
  fetchLocationBundle,
  listLocationCities,
  listLocationStates,
  saveLocationCity,
  saveLocationState,
  type LocationCityRow,
  type LocationStateRow,
} from '../services/locationMasterService';

type Mode = 'states' | 'cities';

type Props = {
  mode: Mode;
};

const countries = CONTACT_COUNTRY_OPTIONS.filter((c) => c !== 'Other');

export const LocationMaster: React.FC<Props> = ({ mode }) => {
  const [country, setCountry] = useState('India');
  const [stateFilter, setStateFilter] = useState('');
  const [query, setQuery] = useState('');
  const [states, setStates] = useState<LocationStateRow[]>([]);
  const [cities, setCities] = useState<LocationCityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [form, setForm] = useState({
    id: '',
    country: 'India',
    state: '',
    name: '',
    syncLeads: true,
  });

  const stateOptions = useMemo(
    () => states.filter((s) => !country || s.country === country).map((s) => s.name),
    [states, country]
  );

  const load = async () => {
    try {
      setLoading(true);
      setError(null);
      await fetchLocationBundle(true);
      if (mode === 'states') {
        const rows = await listLocationStates({ country, q: query || undefined });
        setStates(rows);
      } else {
        const [stateRows, cityRows] = await Promise.all([
          listLocationStates({ country }),
          listLocationCities({
            country,
            state: stateFilter || undefined,
            q: query || undefined,
          }),
        ]);
        setStates(stateRows);
        setCities(cityRows);
      }
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to load location master');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, country, stateFilter]);

  const resetForm = () => {
    setForm({
      id: '',
      country,
      state: stateFilter || '',
      name: '',
      syncLeads: true,
    });
  };

  const onEditState = (row: LocationStateRow) => {
    setForm({
      id: row.id,
      country: row.country,
      state: '',
      name: row.name,
      syncLeads: true,
    });
  };

  const onEditCity = (row: LocationCityRow) => {
    setForm({
      id: row.id,
      country: row.country,
      state: row.state,
      name: row.name,
      syncLeads: true,
    });
  };

  const onSave = async () => {
    try {
      setSaving(true);
      setError(null);
      setNotice(null);
      if (mode === 'states') {
        await saveLocationState({
          id: form.id || undefined,
          country: form.country,
          name: form.name,
        });
        setNotice(form.id ? 'State updated.' : 'State added.');
      } else {
        const result = await saveLocationCity({
          id: form.id || undefined,
          country: form.country,
          state: form.state,
          name: form.name,
          syncLeads: form.syncLeads,
        });
        const synced = Number(result?.syncedLeads || 0);
        setNotice(
          form.id
            ? `City mapping updated${synced ? ` (${synced} lead${synced === 1 ? '' : 's'} synced)` : ''}.`
            : `City mapping added${synced ? ` (${synced} lead${synced === 1 ? '' : 's'} synced)` : ''}.`
        );
      }
      resetForm();
      await load();
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async (id: string) => {
    if (!window.confirm('Remove this mapping?')) return;
    try {
      setSaving(true);
      setError(null);
      if (mode === 'states') await deleteLocationState(id);
      else await deleteLocationCity(id);
      setNotice('Removed.');
      if (form.id === id) resetForm();
      await load();
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Delete failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
        <h2 className="text-xl font-semibold text-slate-900">
          {mode === 'states' ? 'State Master' : 'City Master'}
        </h2>
        <p className="text-sm text-slate-600 mt-1">
          {mode === 'states'
            ? 'Add or rename states used in Partner Leads filters.'
            : 'Map each city to the correct state. Fixing Chandigarh here updates the City filter immediately.'}
        </p>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">Country</label>
            <select
              value={country}
              onChange={(e) => {
                setCountry(e.target.value);
                setStateFilter('');
                setForm((prev) => ({ ...prev, country: e.target.value, state: '' }));
              }}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg"
            >
              {countries.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          {mode === 'cities' && (
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">State filter</label>
              <select
                value={stateFilter}
                onChange={(e) => setStateFilter(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg"
              >
                <option value="">All states</option>
                {stateOptions.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          )}
          <div className={mode === 'cities' ? 'md:col-span-2' : 'md:col-span-3'}>
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">Search</label>
            <div className="flex gap-2">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={mode === 'states' ? 'Search state...' : 'Search city or state...'}
                className="flex-1 px-3 py-2 border border-slate-300 rounded-lg"
              />
              <button
                type="button"
                onClick={load}
                className="px-4 py-2 rounded-lg bg-slate-800 text-white text-sm font-medium hover:bg-slate-900"
              >
                Search
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm space-y-3">
        <h3 className="text-sm font-semibold text-slate-800">
          {form.id ? 'Edit mapping' : 'Add mapping'}
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">Country</label>
            <select
              value={form.country}
              onChange={(e) => setForm((prev) => ({ ...prev, country: e.target.value }))}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg"
            >
              {countries.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          {mode === 'cities' && (
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">State</label>
              <select
                value={form.state}
                onChange={(e) => setForm((prev) => ({ ...prev, state: e.target.value }))}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg"
              >
                <option value="">Select state</option>
                {states
                  .filter((s) => s.country === form.country)
                  .map((s) => (
                    <option key={s.id} value={s.name}>{s.name}</option>
                  ))}
              </select>
            </div>
          )}
          <div className={mode === 'cities' ? '' : 'md:col-span-2'}>
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">
              {mode === 'states' ? 'State name' : 'City name'}
            </label>
            <input
              value={form.name}
              onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg"
              placeholder={mode === 'states' ? 'e.g. Chandigarh' : 'e.g. Panchkula'}
            />
          </div>
          <div className="flex items-end gap-2">
            <button
              type="button"
              disabled={saving || !form.name.trim() || (mode === 'cities' && !form.state.trim())}
              onClick={onSave}
              className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
            >
              {saving ? 'Saving...' : form.id ? 'Update' : 'Add'}
            </button>
            {form.id && (
              <button
                type="button"
                onClick={resetForm}
                className="px-4 py-2 rounded-lg border border-slate-300 text-sm"
              >
                Cancel
              </button>
            )}
          </div>
        </div>
        {mode === 'cities' && (
          <label className="inline-flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={form.syncLeads}
              onChange={(e) => setForm((prev) => ({ ...prev, syncLeads: e.target.checked }))}
            />
            Also update lead contacts that use this city name
          </label>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
        {notice && <p className="text-sm text-emerald-700">{notice}</p>}
      </div>

      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-6 text-sm text-slate-500">Loading...</div>
        ) : mode === 'states' ? (
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="text-left px-4 py-3 font-semibold">Country</th>
                <th className="text-left px-4 py-3 font-semibold">State</th>
                <th className="text-right px-4 py-3 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {states.map((row) => (
                <tr key={row.id} className="border-t border-slate-100">
                  <td className="px-4 py-3">{row.country}</td>
                  <td className="px-4 py-3 font-medium text-slate-900">{row.name}</td>
                  <td className="px-4 py-3 text-right space-x-2">
                    <button type="button" className="text-indigo-600 hover:underline" onClick={() => onEditState(row)}>Edit</button>
                    <button type="button" className="text-red-600 hover:underline" onClick={() => onDelete(row.id)}>Remove</button>
                  </td>
                </tr>
              ))}
              {!states.length && (
                <tr><td colSpan={3} className="px-4 py-6 text-center text-slate-500">No states found</td></tr>
              )}
            </tbody>
          </table>
        ) : (
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="text-left px-4 py-3 font-semibold">Country</th>
                <th className="text-left px-4 py-3 font-semibold">State</th>
                <th className="text-left px-4 py-3 font-semibold">City</th>
                <th className="text-right px-4 py-3 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {cities.map((row) => (
                <tr key={row.id} className="border-t border-slate-100">
                  <td className="px-4 py-3">{row.country}</td>
                  <td className="px-4 py-3">{row.state}</td>
                  <td className="px-4 py-3 font-medium text-slate-900">{row.name}</td>
                  <td className="px-4 py-3 text-right space-x-2">
                    <button type="button" className="text-indigo-600 hover:underline" onClick={() => onEditCity(row)}>Edit</button>
                    <button type="button" className="text-red-600 hover:underline" onClick={() => onDelete(row.id)}>Remove</button>
                  </td>
                </tr>
              ))}
              {!cities.length && (
                <tr><td colSpan={4} className="px-4 py-6 text-center text-slate-500">No cities found</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default LocationMaster;
