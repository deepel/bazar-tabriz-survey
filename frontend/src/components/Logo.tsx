interface LogoProps {
  compact?: boolean;
  className?: string;
}

export default function Logo({ compact = false, className = '' }: LogoProps) {
  return (
    <div className={`brand-mark ${compact ? 'brand-mark-compact' : ''} ${className}`} aria-label="سامانه برداشت بازار تبریز">
      <img src="/brand-logo.png" alt="بازار تبریز" className="brand-image" />
      {!compact && <span className="brand-copy"><strong>بازار تبریز</strong><small>سامانه برداشت میدانی</small></span>}
    </div>
  );
}
