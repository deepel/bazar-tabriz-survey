import type { ImportMatchCandidate } from '../types/importReview';
import { formatMeters, formatScore } from '../utils/importReview';
import { formatPercent } from '../utils/format';

interface Props {
  candidate: ImportMatchCandidate;
  best?: boolean;
  /** Whether picking this candidate is currently enabled in the parent. */
  pinnable?: boolean;
  onPick?: (oldIndex: number) => void;
}

/**
 * One suggested existing shop for a reviewed/ambiguous new feature. Pure
 * presentation: shows the visual evidence up front and the raw technical
 * evidence (fingerprints, handle, …) under a collapsible detail block.
 */
export default function ImportCandidateCard({ candidate, best, pinnable = true, onPick }: Props) {
  const { evidence } = candidate;
  return (
    <div className={`rounded-lg border p-2.5 text-xs ${best ? 'border-[#a84f35]/40 bg-[#a84f35]/5' : 'border-slate-200 bg-white'}`}>
      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-bold text-slate-800">#{candidate.oldIndex}</span>
          <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-500" dir="ltr">
            {candidate.oldShopId}
          </span>
          {candidate.oldName && <span>{candidate.oldName}</span>}
          {!candidate.oldGeometryValid && (
            <span className="rounded-full border border-orange-200 bg-orange-50 px-1.5 text-[10px] text-orange-600">
              هندسهٔ موجود نامعتبر
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {best && <span className="rounded-full border border-[#a84f35]/40 bg-[#a84f35]/10 px-1.5 py-0.5 text-[10px] font-semibold text-[#a84f35]">پیشنهاد برتر</span>}
          <span className={`text-[11px] font-semibold ${best ? 'text-[#a84f35]' : 'text-slate-500'}`}>{formatScore(candidate.score)}</span>
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-slate-500 sm:grid-cols-4">
        <Evidence label="فاصلهٔ مرکز" value={formatMeters(evidence.centroidDistanceMeters)} />
        <Evidence label="هم‌پوشانی" value={formatPercent(evidence.overlapRatio)} />
        <Evidence label="نسبت مساحت" value={formatPercent(evidence.areaRatio)} />
        <Evidence label="شباهت جعبه" value={formatPercent(evidence.bboxSimilarity)} />
      </dl>

      <details className="mt-2 rounded bg-slate-50/70 p-2 text-[11px] leading-relaxed text-slate-500">
        <summary className="cursor-pointer select-none text-slate-600">جزئیات فنی</summary>
        <dl className="mt-1.5 space-y-1">
          <Evidence label="دستهٔ موجود (EntityHandle)" value={candidate.oldHandle ?? '—'} ltr />
          <Evidence label="اثر انگشت هندسهٔ موجود" value={candidate.oldFingerprint} ltr mono />
          <Evidence label="وضعیت هندسهٔ موجود" value={candidate.oldGeometryValid ? 'معتبر' : 'نامعتبر'} />
        </dl>
      </details>

      {pinnable && (
        <button className="btn-ghost mt-2 w-full py-1 text-[11px]" onClick={() => onPick?.(candidate.oldIndex)}>
          انتخاب این گزینه
        </button>
      )}
    </div>
  );
}

function Evidence({ label, value, ltr, mono }: { label: string; value: string; ltr?: boolean; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="shrink-0 text-slate-400">{label}:</dt>
      <dd
        className={`min-w-0 break-all text-left font-medium text-slate-700 ${mono ? 'font-mono' : ''}`}
        dir={ltr ? 'ltr' : undefined}
      >
        {value}
      </dd>
    </div>
  );
}