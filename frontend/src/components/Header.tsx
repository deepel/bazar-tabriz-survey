import { useAuth } from '../hooks/useAuth';

export default function Header({
  center,
  right,
  left
}: {
  center?: React.ReactNode;
  right?: React.ReactNode;
  left?: React.ReactNode;
}) {
  const auth = useAuth();

  return (
    <header className="relative z-50 flex items-center gap-3 border-b border-slate-200 bg-white px-3 py-2.5 shadow-sm">
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-600 text-[11px] font-bold text-white shadow-sm">
          با
        </span>
        <span className="hidden text-sm font-semibold sm:inline">بازار تبریز</span>
      </div>
      {center && <div className="flex-1 px-2 text-center text-xs font-medium text-slate-500">{center}</div>}
      <div className="flex items-center gap-2">
        {right}
        <span className="hidden text-xs text-slate-400 sm:inline">{auth.user?.username}</span>
        <button onClick={() => auth.logout()} className="btn-ghost px-2.5 py-1.5 text-xs">
          خروج
        </button>
      </div>
      {left && <div className="mr-auto text-xs text-slate-500">{left}</div>}
    </header>
  );
}