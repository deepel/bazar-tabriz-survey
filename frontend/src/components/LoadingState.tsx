export default function LoadingState({ message = 'در حال بارگذاری...' }: { message?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 p-6 text-slate-500">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-blue-600" />
      <span>{message}</span>
    </div>
  );
}