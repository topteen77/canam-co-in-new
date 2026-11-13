import React, { useEffect, useMemo, useRef, useState } from 'react';
import { isInactiveUser } from '../utils/userSelect';
import {
  createTrainingDocument,
  deleteTeamTarget,
  deleteTrainingDocument,
  downloadTrainingDocument,
  fetchTrainingDocumentBlob,
  fetchTrainingMeta,
  fileToBase64,
  formatFileSize,
  isPdfFile,
  isWordFile,
  listTeamTargets,
  listTrainingDocuments,
  saveTeamTarget,
  updateTrainingDocument,
  type TeamTarget,
  type TrainingDocument,
} from '../services/trainingTargetsService';

type Props = {
  isAdmin: boolean;
  currentUser: string | null;
  availableUsers: Array<{ id: string; name: string; email: string; role: string; status?: string }>;
};

const DEFAULT_MODULES = [
  'System How-to',
  'B2B',
  'SRP Test Prep Marketing',
  'Speak Easy - Sales',
  'Marketing',
  'Prime Products',
  'VAS',
  'Onboarding',
  'Other',
];

function currentPeriodLabel(d = new Date()): string {
  return d.toLocaleString('en-US', { month: 'short', year: 'numeric' });
}

function monthBounds(label?: string): { start: string; end: string; label: string } {
  const now = new Date();
  let year = now.getFullYear();
  let month = now.getMonth();
  if (label) {
    const parsed = new Date(`${label} 1`);
    if (!Number.isNaN(parsed.getTime())) {
      year = parsed.getFullYear();
      month = parsed.getMonth();
    }
  }
  const start = new Date(year, month, 1);
  const end = new Date(year, month + 1, 0);
  const toIso = (dt: Date) => dt.toISOString().slice(0, 10);
  return {
    label: start.toLocaleString('en-US', { month: 'short', year: 'numeric' }),
    start: toIso(start),
    end: toIso(end),
  };
}

function normalizeUrl(url: string): string {
  const value = String(url || '').trim();
  if (!value) return '';
  if (/^https?:\/\//i.test(value)) return value;
  return `https://${value}`;
}

function FileThumb({
  fileName,
  fileType,
  size = 'md',
}: {
  fileName: string;
  fileType?: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  const pdf = isPdfFile(fileName) || isPdfFile(fileType || '');
  const word = isWordFile(fileName) || isWordFile(fileType || '');
  const box =
    size === 'lg' ? 'h-24 w-20 text-sm' : size === 'sm' ? 'h-12 w-10 text-[10px]' : 'h-16 w-14 text-xs';
  const tone = pdf
    ? 'bg-rose-50 border-rose-200 text-rose-700'
    : word
      ? 'bg-sky-50 border-sky-200 text-sky-700'
      : 'bg-slate-50 border-slate-200 text-slate-600';
  return (
    <div className={`${box} ${tone} border rounded-lg flex flex-col items-center justify-center font-semibold shrink-0`}>
      <span className="text-lg leading-none">{pdf ? 'PDF' : word ? 'W' : 'DOC'}</span>
      <span className="mt-1 opacity-80">{pdf ? 'Adobe' : word ? 'Word' : 'File'}</span>
    </div>
  );
}

export const TrainingTargets: React.FC<Props> = ({ isAdmin, currentUser, availableUsers }) => {
  const [tab, setTab] = useState<'training' | 'targets'>('training');
  const [modules, setModules] = useState<string[]>(DEFAULT_MODULES);
  const [maxDocs, setMaxDocs] = useState(10);
  const [maxBytes, setMaxBytes] = useState(5 * 1024 * 1024);
  const [docs, setDocs] = useState<TrainingDocument[]>([]);
  const [targets, setTargets] = useState<TeamTarget[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewTitle, setPreviewTitle] = useState('');
  const [previewKind, setPreviewKind] = useState<'pdf' | 'other'>('other');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [docForm, setDocForm] = useState({
    id: '',
    title: '',
    module: '',
    toolUrl: '',
    file: null as File | null,
    existingFileName: '',
    existingFileType: '',
    existingFileSize: 0,
  });

  const period = monthBounds();
  const [targetForm, setTargetForm] = useState({
    userEmail: '',
    userName: '',
    periodLabel: period.label,
    periodStart: period.start,
    periodEnd: period.end,
    leadsTarget: 0,
    meetingsTarget: 0,
    onboardingsTarget: 0,
    notes: '',
  });

  const activeUsers = useMemo(
    () =>
      availableUsers
        .filter((u) => u.email && !isInactiveUser(u))
        .sort((a, b) => (a.name || a.email).localeCompare(b.name || b.email)),
    [availableUsers]
  );

  const localPreviewUrl = useMemo(() => {
    if (!docForm.file) return null;
    return URL.createObjectURL(docForm.file);
  }, [docForm.file]);

  useEffect(() => {
    return () => {
      if (localPreviewUrl) URL.revokeObjectURL(localPreviewUrl);
    };
  }, [localPreviewUrl]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const load = async () => {
    try {
      setLoading(true);
      setError(null);
      const [meta, documentRows, targetRows] = await Promise.all([
        fetchTrainingMeta().catch(() => ({
          modules: DEFAULT_MODULES,
          limits: { maxFileBytes: maxBytes, maxDocuments: maxDocs, allowedExt: ['pdf', 'doc', 'docx'] },
        })),
        listTrainingDocuments(),
        listTeamTargets(isAdmin ? undefined : currentUser || undefined),
      ]);
      setModules(meta.modules?.length ? meta.modules : DEFAULT_MODULES);
      setMaxDocs(meta.limits?.maxDocuments || 10);
      setMaxBytes(meta.limits?.maxFileBytes || 5 * 1024 * 1024);
      setDocs(documentRows);
      setTargets(targetRows);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to load training data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, currentUser]);

  const resetDocForm = () => {
    setDocForm({
      id: '',
      title: '',
      module: '',
      toolUrl: '',
      file: null,
      existingFileName: '',
      existingFileType: '',
      existingFileSize: 0,
    });
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const onEditDoc = (doc: TrainingDocument) => {
    setDocForm({
      id: doc.id,
      title: doc.title,
      module: doc.module,
      toolUrl: doc.toolUrl || '',
      file: null,
      existingFileName: doc.fileName,
      existingFileType: doc.fileType,
      existingFileSize: doc.fileSize,
    });
    if (fileInputRef.current) fileInputRef.current.value = '';
    setTab('training');
    setNotice(null);
    setError(null);
  };

  const validateFile = (file: File) => {
    if (file.size > maxBytes) throw new Error('File size must be 5 MB or less');
    const lower = file.name.toLowerCase();
    if (!lower.endsWith('.pdf') && !lower.endsWith('.doc') && !lower.endsWith('.docx')) {
      throw new Error('Only Word (.doc, .docx) and PDF files are allowed');
    }
  };

  const onPickFile = (file: File | null) => {
    if (!file) {
      setDocForm((p) => ({ ...p, file: null }));
      return;
    }
    try {
      validateFile(file);
      setDocForm((p) => ({ ...p, file }));
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Invalid file');
      if (fileInputRef.current) fileInputRef.current.value = '';
      setDocForm((p) => ({ ...p, file: null }));
    }
  };

  const onSaveDoc = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return;
    try {
      setSaving(true);
      setError(null);
      setNotice(null);
      if (!docForm.title.trim()) throw new Error('Document title is required');
      if (!docForm.module.trim()) throw new Error('Module is required');
      if (!docForm.id && !docForm.file) throw new Error('Choose a Word or PDF file to upload');
      if (docForm.file) validateFile(docForm.file);
      if (!docForm.id && docs.length >= maxDocs) {
        throw new Error(`Maximum ${maxDocs} training documents allowed`);
      }

      if (docForm.id) {
        const payload: Record<string, string> = {
          title: docForm.title.trim(),
          module: docForm.module.trim(),
          toolUrl: docForm.toolUrl.trim(),
        };
        if (docForm.file) {
          payload.fileName = docForm.file.name;
          payload.fileType = docForm.file.type || '';
          payload.fileData = await fileToBase64(docForm.file);
        }
        await updateTrainingDocument(docForm.id, payload);
        setNotice('Document updated');
      } else if (docForm.file) {
        await createTrainingDocument({
          title: docForm.title.trim(),
          module: docForm.module.trim(),
          toolUrl: docForm.toolUrl.trim(),
          fileName: docForm.file.name,
          fileType: docForm.file.type || '',
          fileData: await fileToBase64(docForm.file),
        });
        setNotice('Document added');
      }
      resetDocForm();
      await load();
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const onDeleteDoc = async (id: string) => {
    if (!isAdmin || !window.confirm('Delete this training document record?')) return;
    try {
      setSaving(true);
      await deleteTrainingDocument(id);
      setNotice('Document deleted');
      if (docForm.id === id) resetDocForm();
      await load();
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Delete failed');
    } finally {
      setSaving(false);
    }
  };

  const openPreview = async (doc: TrainingDocument) => {
    try {
      setError(null);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      const blob = await fetchTrainingDocumentBlob(doc.id);
      const url = URL.createObjectURL(blob);
      const pdf = isPdfFile(doc.fileName) || isPdfFile(doc.fileType);
      setPreviewUrl(url);
      setPreviewTitle(doc.title || doc.fileName);
      setPreviewKind(pdf ? 'pdf' : 'other');
      if (!pdf) {
        window.open(url, '_blank', 'noopener,noreferrer');
      }
    } catch (err: any) {
      setError(err?.message || 'Preview failed');
    }
  };

  const onPickUser = (email: string) => {
    const user = activeUsers.find((u) => u.email === email);
    const bounds = monthBounds(targetForm.periodLabel);
    setTargetForm((prev) => ({
      ...prev,
      userEmail: email,
      userName: user?.name || '',
      periodLabel: bounds.label,
      periodStart: bounds.start,
      periodEnd: bounds.end,
    }));
  };

  const onEditTarget = (row: TeamTarget) => {
    setTargetForm({
      userEmail: row.userEmail,
      userName: row.userName,
      periodLabel: row.periodLabel,
      periodStart: row.periodStart || '',
      periodEnd: row.periodEnd || '',
      leadsTarget: row.leadsTarget,
      meetingsTarget: row.meetingsTarget,
      onboardingsTarget: row.onboardingsTarget,
      notes: row.notes || '',
    });
    setTab('targets');
  };

  const onSaveTarget = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return;
    try {
      setSaving(true);
      setError(null);
      setNotice(null);
      if (!targetForm.userEmail) throw new Error('Select a team member');
      if (!targetForm.periodLabel.trim()) throw new Error('Period is required');
      await saveTeamTarget({
        userEmail: targetForm.userEmail,
        userName: targetForm.userName,
        periodLabel: targetForm.periodLabel.trim(),
        periodStart: targetForm.periodStart || undefined,
        periodEnd: targetForm.periodEnd || undefined,
        leadsTarget: Number(targetForm.leadsTarget) || 0,
        meetingsTarget: Number(targetForm.meetingsTarget) || 0,
        onboardingsTarget: Number(targetForm.onboardingsTarget) || 0,
        notes: targetForm.notes,
      });
      setNotice('Target saved');
      await load();
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to save target');
    } finally {
      setSaving(false);
    }
  };

  const onDeleteTarget = async (id: string) => {
    if (!isAdmin || !window.confirm('Delete this target?')) return;
    try {
      setSaving(true);
      await deleteTeamTarget(id);
      setNotice('Target deleted');
      await load();
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Delete failed');
    } finally {
      setSaving(false);
    }
  };

  const atMaxDocs = docs.length >= maxDocs && !docForm.id;
  const previewFileName = docForm.file?.name || docForm.existingFileName;
  const previewFileType = docForm.file?.type || docForm.existingFileType;
  const previewFileSize = docForm.file?.size || docForm.existingFileSize;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              {isAdmin ? 'Training, Onboarding & Target Setting' : 'Training & Onboarding'}
            </h2>
            <p className="text-sm text-slate-600 mt-1">
              {isAdmin
                ? `Add up to ${maxDocs} Word/PDF guides (max ${formatFileSize(maxBytes)} each), preview files, add tool links, and set team targets.`
                : 'Open training guides and tool links. Your targets are listed below.'}
            </p>
          </div>
          <div className="inline-flex rounded-lg border border-slate-200 p-1 bg-slate-50">
            <button
              type="button"
              onClick={() => setTab('training')}
              className={`px-3 py-1.5 text-sm rounded-md ${tab === 'training' ? 'bg-indigo-600 text-white' : 'text-slate-700 hover:bg-white'}`}
            >
              Training
            </button>
            <button
              type="button"
              onClick={() => setTab('targets')}
              className={`px-3 py-1.5 text-sm rounded-md ${tab === 'targets' ? 'bg-indigo-600 text-white' : 'text-slate-700 hover:bg-white'}`}
            >
              Targets
            </button>
          </div>
        </div>
        {error && <div className="mt-3 text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{error}</div>}
        {notice && <div className="mt-3 text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">{notice}</div>}
      </div>

      {loading ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-500">Loading…</div>
      ) : tab === 'training' ? (
        <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
          {isAdmin && (
            <form onSubmit={onSaveDoc} className="xl:col-span-2 rounded-xl border border-slate-200 bg-white p-4 space-y-3 shadow-sm">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-semibold text-slate-900">{docForm.id ? 'Edit document record' : 'Add document record'}</h3>
                {docForm.id && (
                  <button type="button" onClick={resetDocForm} className="text-sm text-slate-600 hover:text-slate-900">
                    + New
                  </button>
                )}
              </div>
              <p className="text-xs text-slate-500">{docs.length}/{maxDocs} records · PDF / DOC / DOCX · max 5 MB</p>
              {atMaxDocs && (
                <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  Maximum {maxDocs} records reached. Delete one before adding another.
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Title</label>
                <input
                  value={docForm.title}
                  onChange={(e) => setDocForm((p) => ({ ...p, title: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  placeholder="e.g. B2B partner onboarding guide"
                  required
                  disabled={atMaxDocs}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Module</label>
                <input
                  type="text"
                  value={docForm.module}
                  onChange={(e) => setDocForm((p) => ({ ...p, module: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                  placeholder="Type module name (B2B, VAS, Marketing…)"
                  required
                  disabled={atMaxDocs}
                  autoComplete="off"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Tool / resource link</label>
                <input
                  value={docForm.toolUrl}
                  onChange={(e) => setDocForm((p) => ({ ...p, toolUrl: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  placeholder="https://… (opens in new tab for team)"
                  disabled={atMaxDocs}
                />
              </div>

              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-3">
                <div className="flex items-start gap-3">
                  <FileThumb fileName={previewFileName || 'file.pdf'} fileType={previewFileType} size="lg" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-900">
                      {previewFileName || 'No file selected'}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {previewFileName ? formatFileSize(previewFileSize) : 'PDF / DOC / DOCX · max 5 MB'}
                    </p>
                    <div className="flex flex-wrap gap-2 mt-2">
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={atMaxDocs}
                        className="px-3 py-1.5 text-sm rounded-lg bg-white border border-slate-300 text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                      >
                        {previewFileName ? 'Change file' : 'Choose file'}
                      </button>
                      {docForm.file && localPreviewUrl && isPdfFile(docForm.file.name) && (
                        <button
                          type="button"
                          onClick={() => {
                            setPreviewUrl(localPreviewUrl);
                            setPreviewTitle(docForm.title || docForm.file!.name);
                            setPreviewKind('pdf');
                          }}
                          className="px-3 py-1.5 text-sm rounded-lg bg-white border border-indigo-200 text-indigo-700 hover:bg-indigo-50"
                        >
                          Preview
                        </button>
                      )}
                      {docForm.id && !docForm.file && (
                        <button
                          type="button"
                          onClick={() =>
                            openPreview({
                              id: docForm.id,
                              title: docForm.title,
                              module: docForm.module,
                              fileName: docForm.existingFileName,
                              fileType: docForm.existingFileType,
                              fileSize: docForm.existingFileSize,
                              toolUrl: docForm.toolUrl,
                              sortOrder: 0,
                            })
                          }
                          className="px-3 py-1.5 text-sm rounded-lg bg-white border border-indigo-200 text-indigo-700 hover:bg-indigo-50"
                        >
                          Preview
                        </button>
                      )}
                      {docForm.file && (
                        <button
                          type="button"
                          onClick={() => {
                            setDocForm((p) => ({ ...p, file: null }));
                            if (fileInputRef.current) fileInputRef.current.value = '';
                          }}
                          className="px-3 py-1.5 text-sm rounded-lg bg-white border border-rose-200 text-rose-700 hover:bg-rose-50"
                        >
                          Clear new file
                        </button>
                      )}
                    </div>
                  </div>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  className="hidden"
                  onChange={(e) => onPickFile(e.target.files?.[0] || null)}
                />
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  type="submit"
                  disabled={saving || atMaxDocs}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-60"
                >
                  {saving ? 'Saving…' : docForm.id ? 'Update record' : 'Add record'}
                </button>
                {docForm.id && (
                  <>
                    <button
                      type="button"
                      onClick={() => onDeleteDoc(docForm.id)}
                      disabled={saving}
                      className="px-4 py-2 border border-rose-300 text-rose-700 rounded-lg hover:bg-rose-50"
                    >
                      Delete
                    </button>
                    <button type="button" onClick={resetDocForm} className="px-4 py-2 border border-slate-300 rounded-lg text-slate-700">
                      Cancel
                    </button>
                  </>
                )}
              </div>
            </form>
          )}

          <div className={`${isAdmin ? 'xl:col-span-3' : 'xl:col-span-5'} rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm`}>
            <div className="px-4 py-3 border-b border-slate-100 bg-slate-50 flex items-center justify-between gap-2">
              <h3 className="font-semibold text-slate-900">Training document records</h3>
              <span className="text-xs text-slate-500">{docs.length}/{maxDocs}</span>
            </div>
            {docs.length === 0 ? (
              <div className="p-8 text-center text-slate-500">
                No training documents yet{isAdmin ? '. Add the first record for your team.' : '.'}
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {docs.map((doc) => (
                  <li key={doc.id} className="p-4 flex flex-col sm:flex-row gap-3 sm:items-center justify-between">
                    <div className="flex items-start gap-3 min-w-0">
                      <FileThumb fileName={doc.fileName} fileType={doc.fileType} />
                      <div className="min-w-0">
                        <p className="font-medium text-slate-900 truncate">{doc.title}</p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {doc.module || '—'} · {doc.fileName} · {formatFileSize(doc.fileSize)}
                        </p>
                        {doc.toolUrl ? (
                          <a
                            href={normalizeUrl(doc.toolUrl)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-800 mt-1 break-all"
                          >
                            Open tool link ↗
                          </a>
                        ) : (
                          <p className="text-xs text-slate-400 mt-1">No tool link</p>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => openPreview(doc)}
                        className="px-3 py-1.5 text-sm rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50"
                      >
                        Preview
                      </button>
                      <button
                        type="button"
                        onClick={() => downloadTrainingDocument(doc.id, doc.fileName).catch((err) => setError(err.message))}
                        className="px-3 py-1.5 text-sm rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50"
                      >
                        Download
                      </button>
                      {isAdmin && (
                        <>
                          <button
                            type="button"
                            onClick={() => onEditDoc(doc)}
                            className="px-3 py-1.5 text-sm rounded-lg border border-indigo-200 text-indigo-700 hover:bg-indigo-50"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => onDeleteDoc(doc.id)}
                            className="px-3 py-1.5 text-sm rounded-lg border border-rose-200 text-rose-700 hover:bg-rose-50"
                          >
                            Delete
                          </button>
                        </>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
          {isAdmin && (
            <form onSubmit={onSaveTarget} className="xl:col-span-2 rounded-xl border border-slate-200 bg-white p-4 space-y-3 shadow-sm">
              <h3 className="font-semibold text-slate-900">Set team member target</h3>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Team member</label>
                <select
                  value={targetForm.userEmail}
                  onChange={(e) => onPickUser(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  required
                >
                  <option value="">Select user</option>
                  {activeUsers.map((u) => (
                    <option key={u.id || u.email} value={u.email}>
                      {u.name || u.email}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Period</label>
                <input
                  value={targetForm.periodLabel}
                  onChange={(e) => {
                    const bounds = monthBounds(e.target.value || currentPeriodLabel());
                    setTargetForm((p) => ({
                      ...p,
                      periodLabel: e.target.value,
                      periodStart: bounds.start,
                      periodEnd: bounds.end,
                    }));
                  }}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  placeholder="Mar 2026"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Start</label>
                  <input
                    type="date"
                    value={targetForm.periodStart}
                    onChange={(e) => setTargetForm((p) => ({ ...p, periodStart: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">End</label>
                  <input
                    type="date"
                    value={targetForm.periodEnd}
                    onChange={(e) => setTargetForm((p) => ({ ...p, periodEnd: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Leads</label>
                  <input
                    type="number"
                    min={0}
                    value={targetForm.leadsTarget}
                    onChange={(e) => setTargetForm((p) => ({ ...p, leadsTarget: Number(e.target.value) || 0 }))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Meetings</label>
                  <input
                    type="number"
                    min={0}
                    value={targetForm.meetingsTarget}
                    onChange={(e) => setTargetForm((p) => ({ ...p, meetingsTarget: Number(e.target.value) || 0 }))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Onboard</label>
                  <input
                    type="number"
                    min={0}
                    value={targetForm.onboardingsTarget}
                    onChange={(e) => setTargetForm((p) => ({ ...p, onboardingsTarget: Number(e.target.value) || 0 }))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
                <textarea
                  value={targetForm.notes}
                  onChange={(e) => setTargetForm((p) => ({ ...p, notes: e.target.value }))}
                  rows={3}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  placeholder="Optional coaching notes"
                />
              </div>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-60"
              >
                {saving ? 'Saving…' : 'Save target'}
              </button>
            </form>
          )}

          <div className={`${isAdmin ? 'xl:col-span-3' : 'xl:col-span-5'} rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm`}>
            <div className="px-4 py-3 border-b border-slate-100 bg-slate-50">
              <h3 className="font-semibold text-slate-900">{isAdmin ? 'Team targets' : 'My targets'}</h3>
            </div>
            {targets.length === 0 ? (
              <div className="p-8 text-center text-slate-500">No targets set yet.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-white text-left text-slate-500 border-b border-slate-100">
                    <tr>
                      {isAdmin && <th className="px-4 py-2 font-medium">Member</th>}
                      <th className="px-4 py-2 font-medium">Period</th>
                      <th className="px-4 py-2 font-medium">Leads</th>
                      <th className="px-4 py-2 font-medium">Meetings</th>
                      <th className="px-4 py-2 font-medium">Onboard</th>
                      <th className="px-4 py-2 font-medium">Notes</th>
                      {isAdmin && <th className="px-4 py-2 font-medium">Actions</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {targets.map((row) => (
                      <tr key={row.id} className="border-b border-slate-50">
                        {isAdmin && (
                          <td className="px-4 py-3">
                            <div className="font-medium text-slate-900">{row.userName || row.userEmail}</div>
                            <div className="text-xs text-slate-500">{row.userEmail}</div>
                          </td>
                        )}
                        <td className="px-4 py-3 text-slate-800">{row.periodLabel}</td>
                        <td className="px-4 py-3">{row.leadsTarget}</td>
                        <td className="px-4 py-3">{row.meetingsTarget}</td>
                        <td className="px-4 py-3">{row.onboardingsTarget}</td>
                        <td className="px-4 py-3 text-slate-600 max-w-[220px] truncate">{row.notes || '—'}</td>
                        {isAdmin && (
                          <td className="px-4 py-3">
                            <div className="flex gap-2">
                              <button type="button" onClick={() => onEditTarget(row)} className="text-indigo-600 hover:underline">Edit</button>
                              <button type="button" onClick={() => onDeleteTarget(row.id)} className="text-rose-600 hover:underline">Delete</button>
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {previewUrl && previewKind === 'pdf' && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-5xl h-[85vh] flex flex-col overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between gap-3">
              <h3 className="font-semibold text-slate-900 truncate">{previewTitle}</h3>
              <button
                type="button"
                onClick={() => {
                  if (previewUrl && previewUrl !== localPreviewUrl) URL.revokeObjectURL(previewUrl);
                  setPreviewUrl(null);
                }}
                className="px-3 py-1.5 text-sm rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50"
              >
                Close
              </button>
            </div>
            <iframe title="Document preview" src={previewUrl} className="flex-1 w-full bg-slate-100" />
          </div>
        </div>
      )}
    </div>
  );
};

export default TrainingTargets;
