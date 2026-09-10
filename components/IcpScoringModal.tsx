import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

export type IcpCategoryScores = Record<string, number | ''>;

type IcpRow = {
  cat: string;
  param: string;
  logic: string[];
  ans: string;
  src: string;
};

export const ICP_SCORE_ROWS: IcpRow[] = [
  { cat: 'Business Profile', param: 'Business Age', logic: ['24+ months = 10', '12-24 = 7', '6-12 = 5', '<6 = 2'], ans: '6 months, 2 years, 5+ years', src: 'Zauba, Google reviews' },
  { cat: 'Services Portfolio', param: 'Main Study Destinations', logic: ['Canada focus = 3', 'UK = 2', 'Others = 1'], ans: 'Canada, US, UK, Australia', src: 'Website, Social media' },
  { cat: 'Online Presence', param: 'Digital & Social Media Reputation', logic: ['Strong (≥4.5 & >100 reviews) = 10', 'Moderate = 7', 'Weak = 3'], ans: 'Google rating 4.5+, 200+ reviews', src: 'Google, FB, Instagram' },
  { cat: 'Operational Scale', param: 'Visa Success Cases (Last 6 months)', logic: ['>20 = 10', '15-20 = 7', '10-15 = 5', '<10 = 3'], ans: '10–30', src: 'Internal data / Ref call' },
  { cat: 'Applicant Volume', param: 'Successful Submissions', logic: ['>50 = 10', '25-50 = 7', '<25 = 5'], ans: '25–100+', src: 'CRM / Reference' },
  { cat: 'Team Strength', param: 'Staff Count', logic: ['Well-staffed = 10', 'Moderate = 7', 'Small = 5'], ans: 'Counselors: 5-10, Visa: 2-3, Ops: 2-5', src: 'LinkedIn / Office call' },
  { cat: 'Network Strength', param: 'Tie-ups (Canada)', logic: ['>10 = 10', '5-10 = 7', '<5 = 5'], ans: 'Canada: 10-20, USA: 5', src: 'Partner list / Call' },
  { cat: 'Applicant Quality', param: 'Genuine Ratio', logic: ['<5% fake = 10', '5-10% = 7', '10-20% = 5'], ans: '<5% fake cases', src: 'Record audit / Referral' },
  { cat: 'Physical Presence', param: 'Branches', logic: ['Multi-city = 10', 'Single-city = 7'], ans: 'e.g., Delhi, Punjab, Dubai', src: 'Website / Call' }
];

export const ICP_SCORE_MIN = 0;
export const ICP_SCORE_MAX = 10;
export const ICP_SCORE_STEP = 1;

export const emptyIcpCategoryScores = (): IcpCategoryScores =>
  Object.fromEntries(ICP_SCORE_ROWS.map((row) => [row.cat, ''])) as IcpCategoryScores;

export const clampIcpScore = (value: number): number => {
  if (!Number.isFinite(value)) return ICP_SCORE_MIN;
  const stepped = Math.round(value / ICP_SCORE_STEP) * ICP_SCORE_STEP;
  return Math.max(ICP_SCORE_MIN, Math.min(ICP_SCORE_MAX, stepped));
};

export const parseIcpScoreInput = (raw: string): number | '' => {
  const digits = String(raw ?? '').replace(/[^\d]/g, '');
  if (digits === '') return '';
  return clampIcpScore(parseInt(digits, 10));
};

interface IcpScoringModalProps {
  onClose: () => void;
  categoryScores: IcpCategoryScores;
  onCategoryScoreChange: (category: string, value: number | '') => void;
  onApply: (score: number) => void;
  banner?: React.ReactNode;
  applyDisabled?: boolean;
}

const ScoreStepper: React.FC<{
  value: number | '';
  onChange: (value: number | '') => void;
  labelledBy?: string;
}> = ({ value, onChange, labelledBy }) => {
  const numeric = typeof value === 'number' ? clampIcpScore(value) : null;
  const atMin = numeric !== null && numeric <= ICP_SCORE_MIN;
  const atMax = numeric !== null && numeric >= ICP_SCORE_MAX;

  const bump = (delta: number) => {
    if (numeric === null) {
      if (delta > 0) onChange(ICP_SCORE_MIN);
      return;
    }
    onChange(clampIcpScore(numeric + delta));
  };

  return (
    <div className="icp-score-stepper inline-flex items-center rounded-lg border border-slate-300 bg-white overflow-hidden shadow-sm">
      <button
        type="button"
        aria-label="Decrease score"
        disabled={numeric === null || atMin}
        onClick={() => bump(-ICP_SCORE_STEP)}
        className="icp-score-step flex items-center justify-center text-xl font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 disabled:opacity-40 disabled:hover:bg-slate-100"
      >
        −
      </button>
      <input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        autoComplete="off"
        aria-labelledby={labelledBy}
        aria-valuemin={ICP_SCORE_MIN}
        aria-valuemax={ICP_SCORE_MAX}
        min={ICP_SCORE_MIN}
        max={ICP_SCORE_MAX}
        step={ICP_SCORE_STEP}
        placeholder="0–10"
        value={numeric === null ? '' : String(numeric)}
        onChange={(event) => onChange(parseIcpScoreInput(event.target.value))}
        onBlur={(event) => {
          const parsed = parseIcpScoreInput(event.target.value);
          onChange(parsed === '' ? '' : clampIcpScore(parsed));
        }}
        className="icp-score-input text-center font-bold text-slate-800 border-x border-slate-300 outline-none focus:bg-indigo-50"
      />
      <button
        type="button"
        aria-label="Increase score"
        disabled={atMax}
        onClick={() => bump(ICP_SCORE_STEP)}
        className="icp-score-step flex items-center justify-center text-xl font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 disabled:opacity-40 disabled:hover:bg-slate-100"
      >
        +
      </button>
    </div>
  );
};

export const IcpScoringModal: React.FC<IcpScoringModalProps> = ({
  onClose,
  categoryScores,
  onCategoryScoreChange,
  onApply,
  banner,
  applyDisabled = false
}) => {
  const [showReference, setShowReference] = useState(false);
  const scores = Object.values(categoryScores).filter((score) => score !== '') as number[];
  const average = scores.length > 0
    ? Math.round((scores.reduce((sum, score) => sum + score, 0) / scores.length) * 10) / 10
    : null;
  const appliedScore = average === null ? null : clampIcpScore(Math.round(average));
  const canApply = appliedScore !== null && !applyDisabled;

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      event.preventDefault();
      if (showReference) setShowReference(false);
      else onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', onKey, true);
    };
  }, [onClose, showReference]);

  return createPortal(
    <div className="fixed inset-0 z-[200] bg-black/50 flex items-end sm:items-center justify-center sm:p-4" onClick={onClose}>
      <div
        className="bg-white w-full h-[100dvh] sm:h-auto sm:max-h-[92vh] sm:rounded-xl sm:max-w-5xl shadow-2xl flex flex-col overflow-hidden"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="px-4 py-3 sm:px-6 sm:py-4 border-b border-slate-100 flex justify-between items-center flex-shrink-0 gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-2xl sm:text-3xl">🎯</span>
            <h2 className="text-lg sm:text-2xl font-bold text-slate-800 truncate">ICP Scoring System</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 text-3xl leading-none min-w-[44px] min-h-[44px]"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3 sm:px-8 sm:py-4">
          {banner}
          <p className="text-sm text-slate-600 mb-3 sm:mb-6 font-medium">
            Enter a score from {ICP_SCORE_MIN} to {ICP_SCORE_MAX} for each category. Use + / − to change by {ICP_SCORE_STEP}. The average is calculated automatically.
          </p>

          <details className="bg-blue-50 border border-blue-100 rounded-xl p-3 sm:p-6 mb-4 sm:mb-6" open>
            <summary className="font-bold text-blue-900 cursor-pointer flex items-center gap-2 min-h-[36px]">
              💡 How to Use
            </summary>
            <ol className="mt-2 space-y-1.5 text-sm text-blue-800 font-medium pl-5 list-decimal">
              <li>Review each category and assessment parameter</li>
              <li>Evaluate the agency based on the scoring logic</li>
              <li>Enter a score ({ICP_SCORE_MIN}–{ICP_SCORE_MAX}, step {ICP_SCORE_STEP}) for each category</li>
              <li>Apply the average to the ICP Score field</li>
            </ol>
          </details>

          {average !== null && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 mb-4 text-sm font-semibold text-emerald-800">
              Average: <span className="text-base">{average.toFixed(1)}/10</span>
              {appliedScore !== null && (
                <span className="ml-1 text-xs font-medium">(applies as {appliedScore}/10)</span>
              )}
            </div>
          )}

          <div className="mb-4 flex sm:justify-end">
            <button
              type="button"
              onClick={() => setShowReference(true)}
              className="w-full sm:w-auto min-h-[44px] px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-semibold"
            >
              View Reference Examples
            </button>
          </div>

          <div className="space-y-3 md:hidden">
            {ICP_SCORE_ROWS.map((row) => (
              <div key={row.cat} className="border border-slate-200 rounded-xl p-3 bg-white shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p id={`icp-cat-${row.cat}`} className="font-bold text-slate-800">{row.cat}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{row.param}</p>
                  </div>
                  <ScoreStepper
                    value={categoryScores[row.cat] ?? ''}
                    onChange={(next) => onCategoryScoreChange(row.cat, next)}
                    labelledBy={`icp-cat-${row.cat}`}
                  />
                </div>
                <ul className="mt-2 text-xs text-slate-600 list-disc pl-4 space-y-0.5">
                  {row.logic.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="hidden md:block overflow-x-auto border border-slate-200 rounded-xl shadow-sm">
            <table className="w-full border-collapse min-w-[720px]">
              <thead>
                <tr className="bg-[#E9EDF9]">
                  <th className="px-4 py-3 text-left text-sm font-bold text-slate-700 border-b border-r border-slate-200">Category</th>
                  <th className="px-4 py-3 text-left text-sm font-bold text-slate-700 border-b border-r border-slate-200">Assessment Parameter</th>
                  <th className="px-4 py-3 text-left text-sm font-bold text-slate-700 border-b border-r border-slate-200">Scoring Logic (0-10)</th>
                  <th className="px-4 py-3 text-center text-sm font-bold text-slate-700 border-b bg-[#D9E2FF]">Your Score ({ICP_SCORE_MIN}–{ICP_SCORE_MAX})</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {ICP_SCORE_ROWS.map((row) => (
                  <tr key={row.cat} className="hover:bg-slate-50/50">
                    <td className="px-4 py-4 text-sm font-bold text-slate-800 border-r border-slate-100">{row.cat}</td>
                    <td className="px-4 py-4 text-sm font-medium text-slate-600 border-r border-slate-100">{row.param}</td>
                    <td className="px-4 py-4 text-sm text-slate-500 border-r border-slate-100">
                      <ul className="list-disc pl-4 space-y-1">
                        {row.logic.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </td>
                    <td className="px-4 py-4 text-center">
                      <ScoreStepper
                        value={categoryScores[row.cat] ?? ''}
                        onChange={(next) => onCategoryScoreChange(row.cat, next)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="flex-shrink-0 border-t border-slate-200 bg-slate-50 p-3 sm:p-4 flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={onClose}
            className="w-full sm:w-auto min-h-[44px] px-6 py-2 text-sm font-semibold bg-slate-400 text-white rounded-lg hover:bg-slate-500"
          >
            Cancel
          </button>
          {canApply && (
            <button
              type="button"
              onClick={() => appliedScore !== null && onApply(appliedScore)}
              className="w-full sm:w-auto min-h-[44px] px-6 py-2 text-sm font-semibold bg-green-600 text-white rounded-lg hover:bg-green-700"
            >
              Apply Score ({appliedScore}/10)
            </button>
          )}
        </div>
      </div>

      {showReference && (
        <div className="fixed inset-0 z-[210] bg-black/50 flex items-end sm:items-center justify-center sm:p-4" onClick={(event) => { event.stopPropagation(); setShowReference(false); }}>
          <div
            className="bg-white w-full h-[100dvh] sm:h-auto sm:max-h-[85vh] sm:rounded-xl sm:max-w-4xl shadow-2xl flex flex-col overflow-hidden"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="bg-[#1D4ED8] text-white px-4 py-3 sm:p-5 flex-shrink-0 flex justify-between items-center gap-3">
              <h3 className="text-lg sm:text-xl font-bold truncate">Reference Examples</h3>
              <button type="button" onClick={() => setShowReference(false)} className="text-white text-2xl min-w-[44px] min-h-[44px]">×</button>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto p-3 sm:p-6">
              <p className="text-sm text-slate-600 mb-4">
                Example answers and where to verify them when scoring each category.
              </p>
              <div className="space-y-3 md:hidden">
                {ICP_SCORE_ROWS.map((row) => (
                  <div key={row.cat} className="border border-slate-200 rounded-xl p-3">
                    <p className="font-bold text-slate-800">{row.cat}</p>
                    <p className="text-xs text-slate-500 mb-2">{row.param}</p>
                    <p className="text-sm text-slate-700"><span className="font-semibold">Example:</span> {row.ans}</p>
                    <p className="text-xs text-slate-500 mt-1"><span className="font-semibold">Verify:</span> {row.src}</p>
                  </div>
                ))}
              </div>
              <div className="hidden md:block overflow-x-auto border border-slate-200 rounded-xl">
                <table className="w-full border-collapse min-w-[680px]">
                  <thead>
                    <tr className="bg-[#E9EDF9]">
                      <th className="px-4 py-3 text-left text-sm font-bold text-slate-700 border-b border-r">Category</th>
                      <th className="px-4 py-3 text-left text-sm font-bold text-slate-700 border-b border-r">Assessment Parameter</th>
                      <th className="px-4 py-3 text-left text-sm font-bold text-slate-700 border-b border-r">Expected / Example Answer</th>
                      <th className="px-4 py-3 text-left text-sm font-bold text-slate-700 border-b">Verification Source</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {ICP_SCORE_ROWS.map((row) => (
                      <tr key={row.cat}>
                        <td className="px-4 py-3 text-sm font-bold text-slate-800 border-r">{row.cat}</td>
                        <td className="px-4 py-3 text-sm text-slate-600 border-r">{row.param}</td>
                        <td className="px-4 py-3 text-sm text-slate-600 border-r">{row.ans}</td>
                        <td className="px-4 py-3 text-sm text-slate-600">{row.src}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="flex-shrink-0 border-t bg-slate-50 p-3 sm:p-4 flex justify-end pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              <button
                type="button"
                onClick={() => setShowReference(false)}
                className="w-full sm:w-auto min-h-[44px] px-8 py-2 bg-[#2563EB] text-white rounded-lg font-bold"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body
  );
};
