let loaded: Promise<void> | null = null;

/** Loads the Google Identity Services script once and resolves when ready. */
export function loadGoogleScript(): Promise<void> {
  if (loaded) return loaded;
  loaded = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-gsi]');
    if (existing) return resolve();
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.defer = true;
    s.dataset.gsi = 'true';
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Failed to load Google sign-in'));
    document.head.appendChild(s);
  });
  return loaded;
}
