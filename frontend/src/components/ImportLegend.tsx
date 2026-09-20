import { IMPORT_COLORS } from '../config/constants';

const ITEMS = [
  { key: 'existing', label: 'موجود (بدون تغییر)' },
  { key: 'geometryChanged', label: 'تغییر هندسه' },
  { key: 'new', label: 'جدید' },
  { key: 'review', label: 'نیاز به بررسی' },
  { key: 'invalid', label: 'نامعتبر' }
] as const;

/** Legend for the import-review map: what each color means. */
export default function ImportLegend() {
  return (
    <div className="flex flex-wrap items-center gap-3 px-1 pb-1 text-[11px] text-slate-500">
      {ITEMS.map((item) => {
        const hex = IMPORT_COLORS[item.key].fill;
        return (
          <span key={item.key} className="inline-flex items-center gap-1.5">
            <span
              className="inline-block h-3 w-3 rounded-sm border opacity-90"
              style={{ backgroundColor: hex, borderColor: '#00000040' }}
            />
            {item.label}
          </span>
        );
      })}
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block h-3 w-3 rounded-sm border border-dashed bg-transparent" style={{ borderColor: '#475569' }} />
        مرز مغازهٔ موجود (گزینهٔ پیشنهادی)
      </span>
    </div>
  );
}