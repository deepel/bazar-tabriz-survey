import type { ImportMatchSummary } from '../types/importReview';
import { formatNumber } from '../utils/format';
import ImportStatusBadge from './ImportStatusBadge';

/**
 * Summary cards for the import review report. Pure presentational: it only
 * knows how to lay out the numbers the matching engine produced.
 */
export default function ImportSummary({ summary }: { summary: ImportMatchSummary }) {
  return (
    <div className="card">
      <h2 className="mb-3 text-sm font-bold">گزارش تطبیق هندسی</h2>
      <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3 lg:grid-cols-5">
        <Stat label="کل ویژگی‌ها" value={formatNumber(summary.totalFeatures)} />
        <Stat label="مغازه موجود" value={formatNumber(summary.existing)} sub={`${formatNumber(summary.exact)} بدون تغییر`} />
        <Stat label="تغییر هندسه" value={formatNumber(summary.geometryChanged)} />
        <Stat label="مغازه جدید" value={formatNumber(summary.newFeatures)} />
        <Stat label="نیاز به بررسی" value={formatNumber(summary.reviewRequired)} badge="REVIEW" />
        <Stat label="نامعتبر" value={formatNumber(summary.invalid)} badge="INVALID" />
        <Stat label="تکراری" value={formatNumber(summary.duplicate)} badge="DUPLICATE" />
        <Stat
          label="مغازه موجود تخصیص‌یافته"
          value={`${formatNumber(summary.oldMatched)} از ${formatNumber(summary.oldReferenced)}`}
        />
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  badge
}: {
  label: string;
  value: string;
  sub?: string;
  badge?: 'REVIEW' | 'INVALID' | 'DUPLICATE';
}) {
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50 p-2.5 text-center">
      {badge && (
        <div className="mb-1 flex justify-center">
          <ImportStatusBadge status={badge} />
        </div>
      )}
      <div className="text-base font-bold text-slate-800">{value}</div>
      <div className="text-[11px] leading-snug text-slate-400">{sub ? `${label} — ${sub}` : label}</div>
    </div>
  );
}