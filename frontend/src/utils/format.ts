function toPersianDigits(input: string | number): string {
  const digits = '۰۱۲۳۴۵۶۷۸۹';
  return String(input).replace(/[0-9]/g, (d) => digits[Number.parseInt(d, 10)]);
}

export function formatNumber(n: number): string {
  return toPersianDigits(new Intl.NumberFormat('en-US').format(n));
}

export function formatPercent(n: number): string {
  return `${toPersianDigits(n.toFixed(1).replace(/\.0$/, ''))}٪`;
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  return `${toPersianDigits(date.toLocaleDateString('fa-IR'))} ${toPersianDigits(date.toLocaleTimeString('fa-IR'))}`;
}