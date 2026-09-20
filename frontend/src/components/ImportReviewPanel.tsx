import type { ImportFeatureMatch, ImportResolution } from '../types/importReview';
import { issueLabel, reasonLabel } from '../utils/importReview';
import { decisionLabel } from '../utils/importReviewState';
import ImportCandidateCard from './ImportCandidateCard';
import ImportStatusBadge from './ImportStatusBadge';

interface Props {
  match: ImportFeatureMatch;
  /** Stored decision for this feature, if any. */
  resolution?: ImportResolution;
  /** Winning candidate (best score or the one the user picked). */
  pinnedOldIndex?: number | null;
  onPick?: (candidateOldIndex: number) => void;
  onResolve?: (match: ImportFeatureMatch, resolution: ImportResolution) => void;
  /** Forget a stored decision so the user can choose again. */
  onClearResolution?: (match: ImportFeatureMatch) => void;
  busy?: boolean;
}

/**
 * Review entry for one new feature. Pure presentational: lays out the engine
 * decision and offers the human the allowed actions; the page performs the
 * actual resolve calls. The candidates stay visible even after a decision so
 * the admin can always double-check (and re-decide) before applying.
 */
export default function ImportReviewPanel({
  match,
  resolution,
  pinnedOldIndex,
  onPick,
  onResolve,
  onClearResolution,
  busy = false
}: Props) {
  const reason = reasonLabel(match.reason);
  const status = match.status;
  const needsDecision = match.reviewRequired && !resolution;
  const disabled = busy;

  return (
    <section className={`card ${match.reviewRequired ? 'border-purple-200' : ''}`}>
      <header className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-bold text-slate-800">#{match.newIndex}</span>
          {match.newHandle && (
            <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-500" dir="ltr">
              {match.newHandle}
            </span>
          )}
          <ImportStatusBadge status={status} />
        </div>
        {match.bestScore !== null && (
          <span className="text-[11px] text-slate-400">امتیاز: {(match.bestScore * 100).toFixed(0)}٪</span>
        )}
      </header>

      {reason && (
        <p className={`mb-2 text-xs font-medium leading-relaxed ${status === 'INVALID' ? 'text-orange-700' : 'text-purple-700'}`}>
          {reason}
        </p>
      )}

      {status === 'INVALID' && !match.geometryValid && <InvalidBanner match={match} />}

      {status === 'DUPLICATE' && (
        <p className="mb-2 rounded bg-slate-50 p-2 text-[11px] leading-relaxed text-slate-600">
          این ویژگی در همان فایل تکراری است و برای جلوگیری از ثبت دوباره، باید از فایل حذف شود.
        </p>
      )}

      {status === 'NEW' && (
        <p className="mb-2 text-[11px] text-blue-700">مکان جدید — هنگام اعمال، با شناسهٔ تازه ثبت می‌شود.</p>
      )}

      {(status === 'EXACT_MATCH' || status === 'GEOMETRY_MATCH') && (
        <p className="mb-2 text-[11px] text-slate-600">
          شناسهٔ فروشگاه حفظ می‌شود: {match.matchedOldShopId ? `#${match.matchedOldShopId}` : '—'}
        </p>
      )}

      {match.candidates.length > 0 && (
        <div className="mb-3 space-y-2">
          <div className="text-[11px] font-semibold text-slate-500">گزینه‌های پیشنهادی:</div>
          {match.candidates.map((candidate) => (
            <ImportCandidateCard
              key={candidate.oldIndex}
              candidate={candidate}
              best={candidate.oldIndex === (pinnedOldIndex ?? match.candidates[0]?.oldIndex)}
              pinnable={needsDecision && onPick !== undefined && status === 'REVIEW'}
              onPick={onPick}
            />
          ))}
        </div>
      )}

      {resolution ? (
        <ResolvedBanner resolution={resolution} onClear={() => onClearResolution?.(match)} disabled={disabled} />
      ) : status === 'REVIEW' ? (
        <ReviewActions
          match={match}
          pinnedOldIndex={pinnedOldIndex}
          onResolve={onResolve}
          disabled={disabled}
        />
      ) : status === 'INVALID' || status === 'DUPLICATE' ? (
        <ExcludeAction match={match} onResolve={onResolve} disabled={disabled} />
      ) : (
        <p className="mt-2 rounded bg-green-50 p-2 text-[11px] text-green-700">
          این مورد نیازی به بررسی ندارد و هنگام اعمال خودکار ثبت می‌شود.
        </p>
      )}
    </section>
  );
}

function InvalidBanner({ match }: { match: ImportFeatureMatch }) {
  return (
    <div className="mb-2 rounded border border-orange-200 bg-orange-50 p-2">
      <div className="text-[11px] font-semibold text-orange-700">هندسه نامعتبر است</div>
      {match.geometryIssues.length > 0 && (
        <ul className="mt-1 list-inside list-disc text-[11px] leading-relaxed text-orange-700">
          {match.geometryIssues.map((issue) => (
            <li key={issue}>{issueLabel(issue)}</li>
          ))}
        </ul>
      )}
      <p className="mt-1 text-[11px] text-orange-600">اصلاح خودکار انجام نمی‌شود؛ این مورد فقط با حذف از فایل قابل رفع است.</p>
    </div>
  );
}

function ReviewActions({
  match,
  pinnedOldIndex,
  onResolve,
  disabled
}: {
  match: ImportFeatureMatch;
  pinnedOldIndex?: number | null;
  onResolve?: Props['onResolve'];
  disabled: boolean;
}) {
  const best = match.candidates[0];
  const target = match.candidates.find((c) => c.oldIndex === pinnedOldIndex) ?? best;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {target && (
        <button
          className="btn-primary flex-1 text-xs"
          disabled={disabled}
          onClick={() => onResolve?.(match, { action: 'same_existing_shop', oldShopId: target.oldShopId })}
        >
          همین فروشگاه است (#{target.oldShopId})
        </button>
      )}
      <button
        className="btn-ghost flex-1 text-xs"
        disabled={disabled}
        onClick={() => onResolve?.(match, { action: 'new_shop' })}
      >
        این مکان فروشگاه جدیدی است
      </button>
    </div>
  );
}

function ExcludeAction({
  match,
  onResolve,
  disabled
}: {
  match: ImportFeatureMatch;
  onResolve?: Props['onResolve'];
  disabled: boolean;
}) {
  return (
    <button
      className="btn-ghost w-full text-xs"
      disabled={disabled}
      onClick={() => onResolve?.(match, { action: 'exclude' })}
    >
      حذف از فایل ({match.status === 'INVALID' ? 'هندسه نامعتبر' : 'تکراری'})
    </button>
  );
}

function ResolvedBanner({
  resolution,
  onClear,
  disabled
}: {
  resolution: ImportResolution;
  onClear: () => void;
  disabled: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-green-200 bg-green-50 p-2.5">
      <div className="text-xs text-green-700">
        <div className="font-semibold">این مورد برای اعمال آماده است.</div>
        <div className="mt-0.5 text-[11px] text-green-600">{decisionLabel(resolution)}</div>
      </div>
      <button className="btn-ghost px-2 py-1 text-[11px]" onClick={onClear} disabled={disabled}>
        تغییر تصمیم
      </button>
    </div>
  );
}