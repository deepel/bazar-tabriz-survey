import { useState } from 'react';
import { api, ApiError } from '../api/client';
import type { User } from '../types';

interface SendResult {
  ok: boolean;
  message: string;
}

export default function MessagesPanel({ users }: { users: User[] }) {
  const surveyors = users.filter((u) => u.role === 'surveyor');
  const [recipient, setRecipient] = useState<'all' | string>('all');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<SendResult | null>(null);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const text = body.trim();
    if (!text) return;

    setSending(true);
    setResult(null);
    try {
      const payload =
        recipient === 'all'
          ? { to_all: true, body: text }
          : { recipient_id: Number(recipient), body: text };
      const res = await api.post<{ message: string }>('/api/admin/messages', payload);
      setResult({ ok: true, message: res.message });
      setBody('');
    } catch (err) {
      setResult({
        ok: false,
        message: err instanceof ApiError ? err.message : 'ارسال پیام ناموفق بود.'
      });
    } finally {
      setSending(false);
    }
  }

  return (
    <form onSubmit={handleSend} className="space-y-3">
      <div>
        <label className="label" htmlFor="msg-recipient">
          گیرنده
        </label>
        <select
          id="msg-recipient"
          className="input"
          value={recipient}
          onChange={(e) => setRecipient(e.target.value)}
        >
          <option value="all">همه ممیزان</option>
          {surveyors.map((u) => (
            <option key={u.id} value={String(u.id)}>
              {u.username}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="label" htmlFor="msg-body">
          متن پیام
        </label>
        <textarea
          id="msg-body"
          className="input min-h-24 resize-y"
          value={body}
          maxLength={2000}
          placeholder="متن پیام را وارد کنید..."
          onChange={(e) => setBody(e.target.value)}
        />
      </div>

      {result && (
        <div
          className={`rounded-lg border p-3 text-sm ${
            result.ok
              ? 'border-green-200 bg-green-50 text-green-700'
              : 'border-red-200 bg-red-50 text-red-700'
          }`}
        >
          {result.message}
        </div>
      )}

      <button type="submit" className="btn-success" disabled={sending || !body.trim()}>
        {sending ? 'در حال ارسال...' : 'ارسال پیام'}
      </button>
    </form>
  );
}