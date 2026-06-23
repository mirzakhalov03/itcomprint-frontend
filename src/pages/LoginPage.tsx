import { Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { GoogleSignInButton } from '../components/GoogleSignInButton';

export function LoginPage() {
  const { user, isLoading } = useAuth();

  if (isLoading) return null;
  if (user) return <Navigate to={user.onboardedAt ? '/app' : '/onboarding'} replace />;

  return (
    <div className="flex h-screen flex-col items-center justify-center bg-ink px-6 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-[12px] bg-brand">
        <img src="/brand/itcomuz-icon-white.png" alt="ITCOMUZ" className="h-9 w-9 object-contain" />
      </div>
      <h1 className="mt-6 font-display text-2xl font-bold tracking-[.04em] text-white">
        ROADSHOW BADGES
      </h1>
      <p className="mt-2 max-w-md text-sm text-faint">
        The badge-printing platform for IT Community of Uzbekistan events. Sign in to manage
        events and print attendee badges.
      </p>
      <div className="mt-8">
        <GoogleSignInButton />
      </div>
    </div>
  );
}
