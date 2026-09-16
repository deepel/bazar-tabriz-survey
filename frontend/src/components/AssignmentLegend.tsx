import { useState } from 'react';
import type { AssignmentMember } from '../types';

interface AssignmentLegendProps {
  members: AssignmentMember[];
}

export default function AssignmentLegend({ members }: AssignmentLegendProps) {
  const [open, setOpen] = useState(false);
  if (members.length === 0) return null;

  return (
    <div className={`absolute right-3 top-16 z-[1050] ${open ? 'w-56' : 'w-11'}`}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex h-11 w-11 items-center justify-center rounded-full border border-[#ded8ce] bg-[#fffdfa]/95 text-sm text-[#40515d] shadow-[0_8px_24px_rgba(37,49,59,.18)] backdrop-blur"
        aria-label={open ? 'بستن راهنمای assignment' : 'باز کردن راهنمای رنگ assignment'}
        title="راهنمای رنگ ممیزان"
      >
        <span className="flex items-center gap-0.5" aria-hidden="true">
          <span className="h-2.5 w-2.5 rounded-full bg-blue-600" />
          <span className="h-2.5 w-2.5 rounded-full bg-purple-600" />
        </span>
      </button>
      {open && (
        <div className="absolute right-0 top-12 w-56 rounded-2xl border border-[#ded8ce] bg-[#fffdfa]/95 p-2.5 shadow-[0_14px_36px_rgba(37,49,59,.18)] backdrop-blur">
          <div className="mb-1 px-2 text-[11px] font-bold text-[#40515d]">رنگ assignment</div>
          <div className="space-y-1">
            {members.map((member) => (
              <div key={member.user_id} className="flex items-center gap-2 rounded-lg px-2 py-1 text-xs text-slate-700">
                <span
                  className="h-3 w-3 shrink-0 rounded-full border border-white shadow-sm"
                  style={{ backgroundColor: member.color }}
                  aria-hidden="true"
                />
                <span className="w-6 text-center text-[10px] font-bold" style={{ color: member.color }}>
                  {member.initials}
                </span>
                <span className="min-w-0 flex-1 truncate" title={member.username}>{member.username}</span>
              </div>
            ))}
          </div>
          <div className="mt-1 px-2 text-[10px] text-slate-400">خط دور مغازه assignment است؛ قرمز/سبز وضعیت برداشت است.</div>
        </div>
      )}
    </div>
  );
}
