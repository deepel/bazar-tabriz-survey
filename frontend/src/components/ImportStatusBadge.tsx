import type { ImportMatchStatus } from '../types/importReview';
import { IMPORT_STATUS_LABELS } from '../utils/importReview';

const CLASSES: Record<ImportMatchStatus, string> = {
  EXACT_MATCH: 'border-slate-300 bg-slate-100 text-slate-600',
  GEOMETRY_MATCH: 'border-amber-300 bg-amber-50 text-amber-700',
  NEW: 'border-blue-300 bg-blue-50 text-blue-700',
  REVIEW: 'border-purple-300 bg-purple-50 text-purple-700',
  INVALID: 'border-orange-300 bg-orange-50 text-orange-700',
  DUPLICATE: 'border-slate-200 bg-slate-50 text-slate-500'
};

export default function ImportStatusBadge({ status }: { status: ImportMatchStatus }) {
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-semibold ${CLASSES[status]}`}
    >
      {IMPORT_STATUS_LABELS[status]}
    </span>
  );
}