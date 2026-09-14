import type { SurveyorStatsResponse } from '../types';
import { formatNumber, formatPercent } from '../utils/format';

export default function SurveyorLeaderboard({ stats }: { stats: SurveyorStatsResponse | null }) {
  if (!stats) return null;
  const total = stats.totalSurveyed || 0;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-right text-sm">
        <thead>
          <tr className="border-b text-xs text-slate-400">
            <th className="pb-2 font-medium">ممیز</th>
            <th className="pb-2 font-medium">نقش</th>
            <th className="pb-2 font-medium">تعداد بررسی</th>
            <th className="pb-2 font-medium">سهم</th>
          </tr>
        </thead>
        <tbody>
          {stats.surveyors.map((user) => {
            const percent = total > 0 ? (user.survey_count / total) * 100 : 0;
            return (
              <tr key={user.id} className="border-b border-slate-100 last:border-0">
                <td className="py-2 font-medium text-slate-800">{user.username}</td>
                <td className="py-2 text-slate-500">ممیز</td>
                <td className="py-2">
                  <span className="inline-flex min-w-8 items-center justify-center rounded-full bg-blue-50 px-2 py-0.5 text-xs font-bold text-blue-700">
                    {formatNumber(user.survey_count)}
                  </span>
                </td>
                <td className="py-2 text-slate-500">{formatPercent(percent)}</td>
              </tr>
            );
          })}
          {stats.surveyors.length === 0 && (
            <tr>
              <td colSpan={4} className="py-3 text-center text-xs text-slate-400">
                کاربر ممیزی وجود ندارد.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}