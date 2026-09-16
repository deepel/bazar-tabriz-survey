import { useAuth } from '../hooks/useAuth';
import Logo from './Logo';

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
    <header className="app-header relative z-50 flex items-center gap-3 px-3 py-2.5">
      <Logo compact className="sm:hidden" />
      <Logo className="hidden sm:flex" />
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
