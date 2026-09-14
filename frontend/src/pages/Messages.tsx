import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError, isUnauthorized } from '../api/client';
import ErrorMessage from '../components/ErrorMessage';
import Header from '../components/Header';
import LoadingState from '../components/LoadingState';
import type { AppMessage, MessagesResponse } from '../types';
import { formatDate } from '../utils/format';

export default function Messages() {
  const [messages, setMessages] = useState<AppMessage[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const result = await api.get<MessagesResponse>('/api/messages');
      setMessages(result.messages);
      setError(null);
      if (result.unread > 0) {
        void api.post('/api/messages/read-all');
      }
    } catch (err) {
      if (isUnauthorized(err)) {
        setError('نشست شما منقضی شده است. لطفاً دوباره وارد شوید.');
        return;
      }
      setError(err instanceof ApiError ? err.message : 'دریافت پیام‌ها ناموفق بود.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="min-h-screen bg-slate-100">
      <Header
        center={<span className="font-bold">پیام‌ها</span>}
        right={
          <Link to="/survey" className="btn-ghost px-2.5 py-1.5 text-xs">
            نقشه برداشت
          </Link>
        }
      />
      <main className="mx-auto max-w-2xl space-y-3 p-4">
        {error && <ErrorMessage message={error} onRetry={load} />}
        {!messages && !error && <LoadingState message="در حال دریافت پیام‌ها..." />}

        {messages && messages.length === 0 && (
          <div className="card py-8 text-center text-sm text-slate-400">
            پیامی برای شما ارسال نشده است.
          </div>
        )}

        {messages?.map((msg) => (
          <article
            key={msg.id}
            className={`card space-y-2 ${msg.is_read ? '' : 'border-blue-300 bg-blue-50/50'}`}
          >
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="flex items-center gap-2">
                <span className="font-semibold text-slate-600">{msg.sender_username}</span>
                {msg.is_broadcast && (
                  <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                    همگانی
                  </span>
                )}
              </span>
              <span>{formatDate(msg.created_at)}</span>
            </div>
            <p className="whitespace-pre-wrap text-sm text-slate-800">{msg.body}</p>
            {!msg.is_read && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-600 px-2 py-0.5 text-[10px] font-bold text-white">
                <span className="h-1.5 w-1.5 rounded-full bg-white" />
                جدید
              </span>
            )}
          </article>
        ))}
      </main>
    </div>
  );
}