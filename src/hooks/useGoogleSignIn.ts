import { useEffect, type RefObject } from 'react';
import { loadGoogleScript } from '../lib/google';
import { useGoogleLogin } from './useAuth';

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string;

const DEFAULT_BUTTON: GoogleButtonOptions = {
  theme: 'outline',
  size: 'large',
  text: 'continue_with',
  shape: 'pill',
};

/**
 * Loads Google Identity Services and renders its sign-in button into `ref`,
 * wiring the credential straight into our login mutation. Used both by the
 * standalone sign-in button and the landing page (which overlays the rendered
 * button invisibly over its own CTA), so the GSI lifecycle lives in one place.
 *
 * Returns the login mutation so callers can surface its error/pending state.
 */
export function useGoogleSignIn<T extends HTMLElement>(
  ref: RefObject<T | null>,
  options?: GoogleButtonOptions,
) {
  const login = useGoogleLogin();

  useEffect(() => {
    let cancelled = false;
    loadGoogleScript().then(() => {
      if (cancelled || !ref.current || !window.google) return;
      window.google.accounts.id.initialize({
        client_id: CLIENT_ID,
        callback: (resp) => login.mutate(resp.credential),
      });
      window.google.accounts.id.renderButton(ref.current, { ...DEFAULT_BUTTON, ...options });
    });
    return () => {
      cancelled = true;
    };
    // login.mutate identity is stable across renders (React Query); options is a
    // static config object per caller, so a one-shot render is intended.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return login;
}
