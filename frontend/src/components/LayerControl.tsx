import { useEffect, useRef, useState } from 'react';
import type { GisLayer } from '../types';

interface LayerControlProps {
  layers: GisLayer[];
  visibility: Record<string, boolean>;
  onToggle: (layerKey: string, visible: boolean) => void;
  baseMap?: 'osm' | 'satellite' | 'none';
  onBaseMapChange?: (mode: 'osm' | 'satellite' | 'none') => void;
  pointVisible?: boolean;
  onPointToggle?: (visible: boolean) => void;
  serviceVisible?: boolean;
  onServiceToggle?: (visible: boolean) => void;
  doorVisible?: boolean;
  onDoorToggle?: (visible: boolean) => void;
}

const MASK_KEY = 'bazar-area';

/**
 * Surveyor-facing toggle for the reference layers. Buildings/Lines/Ways toggle
 * straight away; hiding the bazaar mask requires a confirming second click so
 * it cannot be switched off accidentally.
 */
export default function LayerControl({
  layers,
  visibility,
  onToggle,
  baseMap = 'osm',
  onBaseMapChange,
  pointVisible = true,
  onPointToggle,
  serviceVisible = true,
  onServiceToggle
  ,doorVisible = true
  ,onDoorToggle
}: LayerControlProps) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);
  const confirmTimer = useRef<number | undefined>(undefined);

  useEffect(
    () => () => {
      if (confirmTimer.current !== undefined) window.clearTimeout(confirmTimer.current);
    },
    []
  );

  function handleClick(layerKey: string) {
    const currentlyVisible = visibility[layerKey] !== false;
    if (layerKey === MASK_KEY && currentlyVisible) {
      if (confirming === layerKey) {
        onToggle(layerKey, false);
        setConfirming(null);
        if (confirmTimer.current !== undefined) window.clearTimeout(confirmTimer.current);
        return;
      }
      setConfirming(layerKey);
      if (confirmTimer.current !== undefined) window.clearTimeout(confirmTimer.current);
      confirmTimer.current = window.setTimeout(() => setConfirming(null), 4000);
      return;
    }
    onToggle(layerKey, !currentlyVisible);
    setConfirming(null);
  }

  return (
    <div className={`absolute bottom-3 right-3 z-[1000] ${open ? 'w-60' : 'w-11'}`}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex h-11 w-11 items-center justify-center rounded-full border border-[#ded8ce] bg-[#fffdfa]/95 text-lg text-[#40515d] shadow-[0_8px_24px_rgba(37,49,59,.18)] backdrop-blur transition hover:bg-white"
        aria-label={open ? 'بستن منوی لایه‌ها' : 'باز کردن منوی لایه‌ها'}
        title={open ? 'بستن منوی لایه‌ها' : 'لایه‌ها و نقشه پایه'}
      >
        <span aria-hidden="true">{open ? '×' : '◈'}</span>
      </button>
      {open && (
        <div className="absolute bottom-12 right-0 w-60 space-y-2 rounded-2xl border border-[#ded8ce] bg-[#fffdfa]/95 p-2.5 shadow-[0_14px_36px_rgba(37,49,59,.18)] backdrop-blur">
          <div className="px-2 pb-1 text-[11px] font-bold text-[#40515d]">نمایش نقشه</div>
          {onBaseMapChange && (
            <div className="grid grid-cols-3 gap-1 rounded-xl bg-[#f2eee8] p-1">
              {([
                ['osm', 'نقشه', '⌁'],
                ['satellite', 'ماهواره‌ای', '▦'],
                ['none', 'خاموش', '○']
              ] as const).map(([mode, label, icon]) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => onBaseMapChange(mode)}
                  className={`flex flex-col items-center gap-0.5 rounded-lg px-1 py-2 text-[10px] transition ${
                    baseMap === mode ? 'bg-white font-bold text-[#a84f35] shadow-sm' : 'text-slate-500 hover:bg-white/70'
                  }`}
                  aria-pressed={baseMap === mode}
                >
                  <span className="text-sm" aria-hidden="true">{icon}</span>
                  <span>{label}</span>
                </button>
              ))}
            </div>
          )}
          {onPointToggle && (
            <button
              type="button"
              onClick={() => onPointToggle(!pointVisible)}
              className="flex w-full items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-700"
              aria-pressed={pointVisible}
            >
              <span className="flex items-center gap-2"><span className="h-3 w-3 rounded-full border-2 border-teal-700 bg-teal-300" /> مکان‌های تکمیلی (Point)</span>
              <span>{pointVisible ? 'روشن' : 'خاموش'}</span>
            </button>
          )}
          {onServiceToggle && (
            <button
              type="button"
              onClick={() => onServiceToggle(!serviceVisible)}
              className="flex w-full items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-700"
              aria-pressed={serviceVisible}
            >
              <span className="flex items-center gap-2"><span className="flex h-3 w-3 items-center justify-center text-[10px] text-violet-700">◆</span> خدمات</span>
              <span>{serviceVisible ? 'روشن' : 'خاموش'}</span>
            </button>
          )}
          {onDoorToggle && (
            <button
              type="button"
              onClick={() => onDoorToggle(!doorVisible)}
              className="flex w-full items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-700"
              aria-pressed={doorVisible}
            >
              <span className="flex items-center gap-2"><span className="flex h-3 w-3 items-center justify-center rounded-full border-2 border-amber-700 bg-amber-100 text-[9px] font-bold text-amber-700">↕</span> درها</span>
              <span>{doorVisible ? 'روشن' : 'خاموش'}</span>
            </button>
          )}
          <div className="border-t border-[#eee8df] pt-1 text-[11px] font-bold text-[#40515d]">لایه‌های مرجع</div>
          {layers.map((layer) => {
            const visible = visibility[layer.layer_key] !== false;
            const isArmedConfirm = confirming === layer.layer_key;
            return (
              <button
                key={layer.layer_key}
                type="button"
                onClick={() => handleClick(layer.layer_key)}
                className={`flex w-full items-center gap-2 rounded px-2 py-1 text-right text-xs ${
                  visible ? 'bg-slate-50 text-slate-700' : 'text-slate-400'
                } ${isArmedConfirm ? 'bg-amber-50 text-amber-700' : ''}`}
              >
                <span
                  className={`block h-2.5 w-2.5 shrink-0 rounded-full ${
                    visible ? 'bg-blue-600' : 'bg-slate-200'
                  }`}
                />
                <span className="flex-1">{layer.display_name}</span>
                <span className="text-[10px]">{visible ? '✓' : ''}</span>
              </button>
            );
          })}
          {confirming && (
            <p className="px-2 pb-1 text-[10px] text-amber-600">
              برای مخفی‌کردن محدوده بازار، دوباره کلیک کنید.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
