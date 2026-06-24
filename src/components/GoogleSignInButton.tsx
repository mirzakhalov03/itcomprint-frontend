import { useRef } from 'react';
import { useGoogleSignIn } from '../hooks/useGoogleSignIn';

export function GoogleSignInButton() {
  const ref = useRef<HTMLDivElement>(null);
  const login = useGoogleSignIn(ref);

  return (
    <div className="flex flex-col items-center gap-3">
      <div ref={ref} />
      {login.isError && <p className="text-sm text-amber">Sign-in failed. Please try again.</p>}
    </div>
  );
}
