export default function ErrorMessage({
  message,
  onRetry,
  label
}: {
  message: string;
  onRetry?: () => void;
  label?: string;
}) {
  return (
    <div className="card border-red-200 bg-red-50 p-4 text-center text-red-700">
      <p>{message}</p>
      {onRetry && (
        <button className="btn-ghost mt-3 text-red-600" onClick={onRetry}>
          {label || 'تلاش مجدد'}
        </button>
      )}
    </div>
  );
}