/**
 * A short vibration where the browser supports it. iOS Safari has no `navigator.vibrate`, so
 * there this is a silent no-op, as it is before the first tap. Returns whether it vibrated.
 */
export function buzz(pattern: number | number[]): boolean {
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return false;
  // Chrome logs an error for vibrate before the page's first real tap; skip it quietly instead.
  if (navigator.userActivation?.hasBeenActive === false) return false;
  try {
    return navigator.vibrate(pattern);
  } catch {
    return false;
  }
}
