import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError } from '../api/client';
import { useAuth } from '../hooks/useAuth';
import Logo from '../components/Logo';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const user = await login(username.trim(), password);
      navigate(user.role === 'admin' ? '/admin' : '/survey', { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'خطا در ارتباط با سرور.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-shell p-4">
      <form onSubmit={handleSubmit} className="login-card w-full max-w-sm">
        <div className="mb-8 text-center">
          <Logo className="mx-auto justify-center" />
          <div className="eyebrow mt-6">سامانه عملیات میدانی</div>
          <h1 className="mt-2 text-xl font-bold tracking-tight">خوش آمدید</h1>
          <p className="mt-2 text-sm text-slate-500">برای ادامه، وارد حساب کاربری خود شوید.</p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="label" htmlFor="username">
              نام کاربری
            </label>
            <input
              id="username"
              className="input py-3"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              autoFocus
            />
          </div>
          <div>
            <label className="label" htmlFor="password">
              رمز عبور
            </label>
            <input
              id="password"
              type="password"
              className="input py-3"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>
        </div>

        {error && <div className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}

        <button
          type="submit"
          disabled={loading || !username || !password}
          className="btn-primary mt-6 w-full py-3.5 text-base"
        >
          {loading ? 'در حال ورود...' : 'ورود'}
        </button>
      </form>
    </div>
  );
}
