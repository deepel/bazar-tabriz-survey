import { useEffect, useRef, useState } from 'react';
import type { GisLayer } from '../types';

interface LayerControlProps {
  layers: GisLayer[];
  visibility: Record<string, boolean>;
  onToggle: (layerKey: string, visible: boolean) => void;
}

const MASK_KEY = 'bazar-area';

/**
 * Surveyor-facing toggle for the reference layers. Buildings/Lines/Ways toggle
 * straight away; hiding the bazaar mask requires a confirming second click so
 * it cannot be switched off accidentally.
 */
export default function LayerControl({ layers, visibility, onToggle }: LayerControlProps) {
  const [open, setOpen] = useState(true);
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
    <div className="absolute right-3 top-3 z-[1000] w-44 rounded-lg border border-slate-200 bg-white shadow-md">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between px-3 py-2 text-xs font-bold text-slate-700"
      >
        <span>لایه‌های مرجع</span>
        <span className="text-slate-400">{open ? '−' : '+'}</span>
      </button>
      {open && (
        <div className="space-y-1 border-t border-slate-100 p-2">
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