import { useEffect, useRef, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { loadGoogleScript } from '../lib/google';
import { useAuth, useGoogleLogin } from '../hooks/useAuth';

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string;

/**
 * Pre-sign-up hero. A dark, branded control-center scene that gates the app
 * behind a single "Continue with Google" action. The on-design button is the
 * real CTA; an invisible Google Identity button is overlaid on top of it so the
 * native OAuth flow fires from a fully custom-styled control.
 */
export function LandingPage() {
  const { user, isLoading } = useAuth();
  const login = useGoogleLogin();
  const gsiRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadGoogleScript().then(() => {
      if (cancelled || !gsiRef.current || !window.google) return;
      window.google.accounts.id.initialize({
        client_id: CLIENT_ID,
        callback: (resp) => login.mutate(resp.credential),
      });
      window.google.accounts.id.renderButton(gsiRef.current, {
        theme: 'outline',
        size: 'large',
        text: 'continue_with',
        shape: 'pill',
        width: 320,
      });
    });
    return () => {
      cancelled = true;
    };
    // login.mutate identity is stable across renders (React Query)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (isLoading) return null;
  if (user) return <Navigate to={user.onboardedAt ? '/app' : '/onboarding'} replace />;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: '#1c1d1a',
        fontFamily: "'Open Sans', sans-serif",
        color: '#e6e8e6',
        overflow: 'hidden',
      }}
    >
      {/* LAYER 0: radial vignette + tone */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'radial-gradient(120% 90% at 50% 38%, #262824 0%, #1f201d 46%, #1a1b18 78%, #161714 100%)',
        }}
      />

      {/* LAYER 1: fine drifting grid */}
      <div
        style={{
          position: 'absolute',
          inset: -80,
          opacity: 0.5,
          backgroundImage:
            'linear-gradient(rgba(154,160,148,.07) 1px, transparent 1px), linear-gradient(90deg, rgba(154,160,148,.07) 1px, transparent 1px)',
          backgroundSize: '72px 72px',
        }}
      />

      {/* LAYER 1b: coarse grid, fades to edges */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          opacity: 0.4,
          backgroundImage:
            'linear-gradient(rgba(136,189,85,.05) 1px, transparent 1px), linear-gradient(90deg, rgba(136,189,85,.05) 1px, transparent 1px)',
          backgroundSize: '216px 216px',
          maskImage: 'radial-gradient(110% 80% at 50% 42%, #000 0%, transparent 72%)',
          WebkitMaskImage: 'radial-gradient(110% 80% at 50% 42%, #000 0%, transparent 72%)',
        }}
      />

      {/* LAYER 2: network / connection diagram — calmed down (2 paths, fewer nodes) */}
      <svg
        viewBox="0 0 1440 900"
        preserveAspectRatio="xMidYMid slice"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.9 }}
      >
        <g
          fill="none"
          stroke="#88bd55"
          strokeWidth={1.2}
          strokeOpacity={0.42}
          strokeDasharray="6 10"
        >
          <path d="M120 200 L320 200 L320 360 L520 360" />
          <path d="M1320 700 L1120 700 L1120 540 L940 540" />
        </g>
        <g fill="#88bd55">
          <circle cx="120" cy="200" r="3.5" />
          <circle cx="520" cy="360" r="3.5" />
          <circle cx="940" cy="540" r="3.5" />
        </g>
      </svg>

      {/* LAYER 3: floating wireframe frames */}
      <div
        style={{
          position: 'absolute',
          top: '14%',
          left: '9%',
          width: 150,
          height: 96,
          border: '1px solid rgba(154,160,148,.18)',
          borderRadius: 8,
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: 8,
            left: 10,
            width: 34,
            height: 6,
            borderRadius: 3,
            background: 'rgba(154,160,148,.16)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            top: 8,
            right: 10,
            width: 7,
            height: 7,
            borderRadius: '50%',
            background: 'rgba(136,189,85,.5)',
          }}
        />
      </div>
      <div
        style={{
          position: 'absolute',
          top: '62%',
          left: '13%',
          width: 108,
          height: 108,
          border: '1px solid rgba(154,160,148,.14)',
          borderRadius: 10,
        }}
      />
      <div
        style={{
          position: 'absolute',
          top: '20%',
          right: '11%',
          width: 128,
          height: 84,
          border: '1px solid rgba(136,189,85,.22)',
          borderRadius: 8,
        }}
      >
        <div
          style={{
            position: 'absolute',
            bottom: 10,
            left: 10,
            right: 10,
            height: 1,
            background: 'rgba(136,189,85,.28)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            bottom: 16,
            left: 10,
            width: '48%',
            height: 1,
            background: 'rgba(154,160,148,.2)',
          }}
        />
      </div>
      <div
        style={{
          position: 'absolute',
          bottom: '14%',
          right: '14%',
          width: 140,
          height: 92,
          border: '1px solid rgba(154,160,148,.16)',
          borderRadius: 8,
        }}
      />
      <div
        style={{
          position: 'absolute',
          top: '46%',
          right: '6%',
          width: 64,
          height: 64,
          border: '1px solid rgba(154,160,148,.12)',
          borderRadius: '50%',
        }}
      />

      {/* CENTER STACK */}
      <main
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 'clamp(14px,2.4vh,28px)',
          padding: 'clamp(24px,5vw,48px) clamp(20px,5vw,48px) 84px',
          textAlign: 'center',
          zIndex: 5,
        }}
      >
        {/* logo + glow */}
        <div
          style={{
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div
            style={{
              position: 'absolute',
              width: 340,
              height: 200,
              background: 'radial-gradient(closest-side, rgba(136,189,85,.22), transparent 70%)',
              filter: 'blur(8px)',
              opacity: 0.6,
            }}
          />
          <img
            src="https://itcom.uz/wp-content/uploads/2025/11/logo-itCommunity-green-horizontal.png"
            alt="IT Community"
            style={{ position: 'relative', height: 48, width: 'auto', objectFit: 'contain' }}
          />
        </div>

        {/* eyebrow */}
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 9,
            padding: '7px 15px',
            border: '1px solid rgba(136,189,85,.28)',
            borderRadius: 999,
            background: 'rgba(136,189,85,.06)',
            fontSize: 12.5,
            letterSpacing: '.14em',
            textTransform: 'uppercase',
            color: '#b0d585',
            fontWeight: 600,
          }}
        >
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: '50%',
              background: '#88bd55',
              boxShadow: '0 0 10px #88bd55',
            }}
          />
          Registration Platform
        </div>

        {/* headline */}
        <h1
          style={{
            margin: 0,
            fontFamily: "'Montserrat', sans-serif",
            fontWeight: 700,
            fontSize: 'clamp(40px,5.6vw,76px)',
            lineHeight: 1.02,
            letterSpacing: '-.02em',
            color: '#fcfdfb',
            maxWidth: '16ch',
          }}
        >
          <span
            style={{
              background:
                'linear-gradient(100deg, rgb(136, 189, 85) 0%, rgb(176, 213, 133) 40%, rgb(252, 253, 251) 75%)',
              WebkitBackgroundClip: 'text',
              backgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            Event
          </span>{' '}
          Check-ins,
          <br />
          <span
            style={{
              background:
                'linear-gradient(100deg, rgb(252, 253, 251) 30%, rgb(176, 213, 133) 60%, rgb(136, 189, 85) 100%)',
              WebkitBackgroundClip: 'text',
              backgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            Simplified.
          </span>
        </h1>

        {/* supporting */}
        <p
          style={{
            margin: 0,
            maxWidth: '54ch',
            fontSize: 'clamp(15px,1.35vw,18px)',
            lineHeight: 1.6,
            color: '#9aa094',
            fontWeight: 400,
          }}
        >
          Register attendees, print badges, and run check-in from one control center. What once took
          a minute now takes under ten seconds.
        </p>

        {/* metrics */}
        <div style={{ display: 'flex', alignItems: 'stretch', gap: 0, marginTop: 4 }}>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 5,
              padding: '0 clamp(14px,4.5vw,30px)',
            }}
          >
            <span
              style={{
                fontFamily: "'Montserrat', sans-serif",
                fontWeight: 700,
                fontSize: 30,
                color: '#fcfdfb',
              }}
            >
              &lt;10s
            </span>
            <span
              style={{
                fontSize: 12.5,
                letterSpacing: '.05em',
                color: '#6d7368',
                textTransform: 'uppercase',
              }}
            >
              Average check-in
            </span>
          </div>
          <div
            style={{
              width: 1,
              background: 'linear-gradient(180deg,transparent,rgba(154,160,148,.22),transparent)',
            }}
          />
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 5,
              padding: '0 clamp(14px,4.5vw,30px)',
            }}
          >
            <span
              style={{
                fontFamily: "'Montserrat', sans-serif",
                fontWeight: 700,
                fontSize: 30,
                color: '#fcfdfb',
              }}
            >
              3×
            </span>
            <span
              style={{
                fontSize: 12.5,
                letterSpacing: '.05em',
                color: '#6d7368',
                textTransform: 'uppercase',
              }}
            >
              Faster registration
            </span>
          </div>
          <div
            style={{
              width: 1,
              background: 'linear-gradient(180deg,transparent,rgba(154,160,148,.22),transparent)',
            }}
          />
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 5,
              padding: '0 clamp(14px,4.5vw,30px)',
            }}
          >
            <span
              style={{
                fontFamily: "'Montserrat', sans-serif",
                fontWeight: 700,
                fontSize: 30,
                color: '#88bd55',
              }}
            >
              0
            </span>
            <span
              style={{
                fontSize: 12.5,
                letterSpacing: '.05em',
                color: '#6d7368',
                textTransform: 'uppercase',
              }}
            >
              Queue bottlenecks
            </span>
          </div>
        </div>

        {/* CTA — on-design button with the real Google button overlaid invisibly */}
        <div style={{ position: 'relative', marginTop: 10 }}>
          <button
            type="button"
            onMouseEnter={() => setHover(true)}
            onMouseLeave={() => setHover(false)}
            style={{
              position: 'relative',
              overflow: 'hidden',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 13,
              padding: '15px 28px',
              border: 'none',
              borderRadius: 13,
              background: '#fcfdfb',
              color: '#1c1d1a',
              fontFamily: "'Open Sans', sans-serif",
              fontSize: 16,
              fontWeight: 600,
              cursor: 'pointer',
              boxShadow: hover
                ? '0 18px 48px rgba(0,0,0,.5), 0 0 0 1px rgba(255,255,255,.08), 0 0 44px rgba(136,189,85,.32)'
                : '0 10px 34px rgba(0,0,0,.4), 0 0 0 1px rgba(255,255,255,.06), 0 0 30px rgba(136,189,85,.16)',
              transform: hover ? 'translateY(-3px)' : 'translateY(0)',
              transition: 'transform .25s cubic-bezier(.16,.84,.44,1), box-shadow .25s ease',
            }}
          >
            <svg width="20" height="20" viewBox="0 0 48 48" style={{ position: 'relative' }}>
              <path
                fill="#EA4335"
                d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.9 2.4 30.4 0 24 0 14.6 0 6.4 5.4 2.5 13.2l7.9 6.2C12.3 13.5 17.6 9.5 24 9.5z"
              />
              <path
                fill="#4285F4"
                d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.5 3-2.2 5.5-4.7 7.2l7.3 5.7C43.7 38 46.5 31.9 46.5 24.5z"
              />
              <path
                fill="#FBBC05"
                d="M10.4 28.6c-.5-1.5-.8-3-.8-4.6s.3-3.1.8-4.6l-7.9-6.2C.9 16.3 0 20 0 24s.9 7.7 2.5 10.8l7.9-6.2z"
              />
              <path
                fill="#34A853"
                d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.3-5.7c-2 1.4-4.7 2.3-8.6 2.3-6.4 0-11.7-4-13.6-9.7l-7.9 6.2C6.4 42.6 14.6 48 24 48z"
              />
            </svg>
            <span style={{ position: 'relative' }}>Continue with Google</span>
          </button>

          {/* Invisible, real Google Identity button — scaled to cover the CTA */}
          <div
            ref={gsiRef}
            aria-hidden
            style={{
              position: 'absolute',
              inset: 0,
              opacity: 0.0001,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transform: 'scale(2)',
              cursor: 'pointer',
            }}
          />
        </div>

        {login.isError && (
          <p style={{ margin: 0, fontSize: 13, color: '#f0a830' }}>
            Sign-in failed. Please try again.
          </p>
        )}

        {/* footer */}
        <p
          style={{
            position: 'absolute',
            bottom: 24,
            left: 0,
            right: 0,
            margin: 0,
            fontSize: 12,
            letterSpacing: '.04em',
            color: '#6d7368',
          }}
        >
          Internal access only · IT Community Event Operations · Secured by Google Workspace
        </p>
      </main>
    </div>
  );
}
