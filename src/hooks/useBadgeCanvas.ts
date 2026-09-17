import { useEffect, useRef } from 'react';
import { renderBadgeToCanvas } from '../printer/renderBadge';
import type { Attendee, BadgeTemplate } from '../types';

/**
 * Draws the exact print raster into a visible canvas (debounced), so previews are
 * pixel-identical to the label. Pass stable (memoized) inputs to avoid redundant renders.
 */
export function useBadgeCanvas(
  attendee: Pick<Attendee, 'fullName' | 'extra'> | null,
  template: BadgeTemplate | null,
  delayMs = 150,
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!attendee || !template) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const rendered = await renderBadgeToCanvas(attendee, template);
        const canvas = canvasRef.current;
        if (cancelled || !canvas) return;
        canvas.width = rendered.width;
        canvas.height = rendered.height;
        canvas.getContext('2d')!.drawImage(rendered, 0, 0);
      } catch {
        // fonts may not be ready on first paint — the next input change retries
      }
    }, delayMs);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [attendee, template, delayMs]);

  return { canvasRef };
}
