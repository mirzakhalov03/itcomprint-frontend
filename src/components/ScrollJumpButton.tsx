import { useEffect, useRef, useState, type RefObject } from 'react';
import { ArrowUpIcon } from './icons';

const DURATION_MS = 450;
const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/**
 * Floating jump button for a scroll container: points down in the top half, up in the bottom half.
 * Only appears when the content is long enough (> ~1.5 screens) for the jump to be worth it.
 */
export function ScrollJumpButton({ targetRef }: { targetRef: RefObject<HTMLElement | null> }) {
  const [state, setState] = useState<{ visible: boolean; down: boolean }>({
    visible: false,
    down: true,
  });
  const frame = useRef(0);

  useEffect(() => {
    const el = targetRef.current;
    if (!el) return;

    const update = () => {
      const max = el.scrollHeight - el.clientHeight;
      const visible = max > el.clientHeight * 0.5;
      const down = el.scrollTop < max / 2;
      setState((s) => (s.visible === visible && s.down === down ? s : { visible, down }));
    };
    // User input takes over mid-animation instead of fighting it.
    const cancel = () => cancelAnimationFrame(frame.current);

    update();
    el.addEventListener('scroll', update, { passive: true });
    el.addEventListener('wheel', cancel, { passive: true });
    el.addEventListener('touchstart', cancel, { passive: true });
    // Filtering/search changes list height without any scroll event.
    const ro = new ResizeObserver(update);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);

    return () => {
      cancel();
      el.removeEventListener('scroll', update);
      el.removeEventListener('wheel', cancel);
      el.removeEventListener('touchstart', cancel);
      ro.disconnect();
    };
  }, [targetRef]);

  function jump() {
    const el = targetRef.current;
    if (!el) return;
    cancelAnimationFrame(frame.current);
    const from = el.scrollTop;
    const to = state.down ? el.scrollHeight - el.clientHeight : 0;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      el.scrollTop = to;
      return;
    }
    // Fixed-duration tween: native smooth scroll gets sluggish over long rosters.
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min((now - start) / DURATION_MS, 1);
      el.scrollTop = from + (to - from) * easeInOutCubic(t);
      if (t < 1) frame.current = requestAnimationFrame(step);
    };
    frame.current = requestAnimationFrame(step);
  }

  if (!state.visible) return null;

  return (
    <button
      onClick={jump}
      aria-label={state.down ? 'Scroll to bottom' : 'Scroll to top'}
      title={state.down ? 'Scroll to bottom' : 'Scroll to top'}
      className="animate-fade-in absolute bottom-5 left-5 z-20 flex h-11 w-11 items-center justify-center rounded-full border border-line bg-white text-muted shadow-[0_1px_2px_rgba(0,0,0,.06),0_8px_22px_rgba(0,0,0,.10)] transition-colors hover:border-brand/40 hover:text-brand-deep focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/20"
    >
      <ArrowUpIcon
        size={18}
        className={`transition-transform duration-300 ${state.down ? 'rotate-180' : ''}`}
      />
    </button>
  );
}
