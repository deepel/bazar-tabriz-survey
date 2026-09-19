import { useEffect, useState } from 'react';
import { useMap } from 'react-leaflet';

interface MapPointPlacementProps {
  active: boolean;
  onConfirm: (coordinates: [number, number]) => void;
  onCancel: () => void;
}

/**
 * Shared center-pin placement for shops, services and doors. The map remains
 * draggable; only the geographic center is accepted when the user confirms.
 */
export default function MapPointPlacement({ active, onConfirm, onCancel }: MapPointPlacementProps) {
  const map = useMap();
  const [center, setCenter] = useState<[number, number] | null>(null);

  useEffect(() => {
    if (!active) {
      setCenter(null);
      return undefined;
    }
    const update = () => {
      const current = map.getCenter();
      setCenter([current.lng, current.lat]);
    };
    update();
    map.on('move', update);
    map.on('zoom', update);
    return () => {
      map.off('move', update);
      map.off('zoom', update);
    };
  }, [active, map]);

  if (!active) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-[1200]">
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-full" aria-hidden="true">
        <div className="relative flex h-12 w-10 items-center justify-center">
          <div className="absolute bottom-0 h-4 w-4 rotate-45 rounded-br-md border-2 border-[#8f402b] bg-[#b35c3e] shadow-lg" />
          <div className="absolute bottom-3 h-7 w-7 rounded-full border-4 border-white bg-[#b35c3e] shadow-lg" />
        </div>
      </div>
      <div className="pointer-events-auto absolute inset-x-3 bottom-3 mx-auto max-w-md rounded-2xl border border-[#ded8ce] bg-[#fffdfa]/95 p-3 text-center shadow-[0_-10px_30px_rgba(37,49,59,.2)] backdrop-blur">
        <div className="text-sm font-bold text-[#40515d]">نقطه را زیر پین قرار دهید</div>
        <div className="mt-1 text-[10px] text-slate-400" dir="ltr">
          {center ? `${center[1].toFixed(6)}, ${center[0].toFixed(6)}` : 'در حال دریافت مختصات مرکز'}
        </div>
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            className="btn-primary flex-1 py-3"
            onClick={() => {
              const current = map.getCenter();
              onConfirm([current.lng, current.lat]);
            }}
            disabled={!center}
          >
            تأیید موقعیت
          </button>
          <button type="button" className="btn-ghost px-5 py-3" onClick={onCancel}>
            لغو
          </button>
        </div>
      </div>
    </div>
  );
}
