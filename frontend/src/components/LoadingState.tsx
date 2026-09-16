import Logo from './Logo';

export default function LoadingState({ message = 'در حال بارگذاری...' }: { message?: string }) {
  return (
    <div className="loading-screen">
      <Logo />
      <span className="loading-line" />
      <span className="loading-message">{message}</span>
    </div>
  );
}
