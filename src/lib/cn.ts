/**
 * Joins class names, dropping falsy values so conditional classes read cleanly:
 *   cn('base', active && 'is-active', className)
 *
 * Intentionally minimal (no tailwind-merge): our components keep layout/size
 * utilities in the caller's `className` and never duplicate a property the base
 * already sets, so there are no conflicting utilities to resolve.
 */
export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}
