import type { CategoryStatsResponse } from '../types';
import { formatNumber, formatPercent } from '../utils/format';

export default function CategoryStats({ stats }: { stats: CategoryStatsResponse | null }) {
  if (!stats) return null;
  const total = stats.total || 0;
  const max = Math.max(1, ...stats.categories.map((c) => c.count));

  return (
    <div className="space-y-2.5">
      {stats.categories.map(({ activity, count }) => {
        const percentOfTotal = total > 0 ? (count / total) * 100 : 0;
        const width = (count / max) * 100;
        return (
          <div key={activity} className="flex items-center gap-2 text-xs">
            <span className="w-24 shrink-0 truncate text-slate-600">{activity}</span>
            <div className="h-3 flex-1 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-blue-500"
                style={{ width: `${width}%` }}
                title={`${activity}: ${formatNumber(count)}`}
              />
            </div>
            <span className="w-10 shrink-0 text-left font-semibold text-slate-800">
              {formatNumber(count)}
            </span>
            <span className="w-10 shrink-0 text-left text-slate-400">
              {formatPercent(percentOfTotal)}
            </span>
          </div>
        );
      })}
      <div className="border-t border-slate-100 pt-2 text-sm text-slate-600">
        مجموع بررسی‌شده: <span className="font-bold text-slate-800">{formatNumber(total)}</span>
      </div>
    </div>
  );
}