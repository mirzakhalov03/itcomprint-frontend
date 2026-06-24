import { useEffect, useRef } from 'react';
import { loadGoogleScript } from '../lib/google';
import { useGoogleLogin } from '../hooks/useAuth';

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string;

export function GoogleSignInButton() {
  const ref = useRef<HTMLDivElement>(null);
  const login = useGoogleLogin();

  useEffect(() => {
    let cancelled = false;
    loadGoogleScript().then(() => {
      if (cancelled || !ref.current || !window.google) return;
      window.google.accounts.id.initialize({
        client_id: CLIENT_ID,
        callback: (resp) => login.mutate(resp.credential),
      });
      window.google.accounts.id.renderButton(ref.current, {
        theme: 'outline',
        size: 'large',
        text: 'continue_with',
        shape: 'pill',
      });
    });
    return () => {
      cancelled = true;
    };
    // login.mutate identity is stable across renders (React Query)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex flex-col items-center gap-3">
      <div ref={ref} />
      {login.isError && <p className="text-sm text-amber">Sign-in failed. Please try again.</p>}
    </div>
  );
}
