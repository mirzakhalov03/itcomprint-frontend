/** Pulls a human message off an unknown thrown value, falling back when it isn't an Error. */
export function errMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}
