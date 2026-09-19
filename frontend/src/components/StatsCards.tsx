import type { Stats } from '../types';
import { formatNumber, formatPercent } from '../utils/format';

export default function StatsCards({ stats, pointShops = 0, servicePoints = 0, doorPoints = 0 }: { stats: Stats; pointShops?: number; servicePoints?: number; doorPoints?: number }) {
  const cards = [
    { label: 'کل مغازه‌ها', value: formatNumber(stats.total), color: 'bg-slate-100 text-slate-800' },
    { label: 'بررسی شده', value: formatNumber(stats.surveyed), color: 'bg-green-50 text-green-800' },
    { label: 'باقی‌مانده', value: formatNumber(stats.unsurveyed), color: 'bg-red-50 text-red-800' },
    { label: 'پیشرفت', value: formatPercent(stats.progress), color: 'bg-blue-50 text-blue-800' },
    { label: 'مکان‌های تکمیلی خارج از همکف', value: formatNumber(pointShops), color: 'bg-teal-50 text-teal-800' },
    { label: 'خدمات', value: formatNumber(servicePoints), color: 'bg-violet-50 text-violet-800' },
    { label: 'درهای بازار', value: formatNumber(doorPoints), color: 'bg-amber-50 text-amber-800' }
  ];
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-7">
      {cards.map((card) => (
        <div key={card.label} className={`card p-3 text-center ${card.color}`}>
          <div className="text-lg font-bold">{card.value}</div>
          <div className="text-xs opacity-80">{card.label}</div>
        </div>
      ))}
    </div>
  );
}
