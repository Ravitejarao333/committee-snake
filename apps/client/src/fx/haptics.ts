/**
 * A short vibration where the browser supports it. iOS Safari has no `navigator.vibrate`, so
 * there this is a silent no-op. Returns whether a vibration was requested.
 */
export function buzz(pattern: number | number[]): boolean {
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return false;
  try {
    return navigator.vibrate(pattern);
  } catch {
    return false;
  }
}
