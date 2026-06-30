export function throttle<T extends unknown[]>(
  callback: (...args: T) => void,
  delayMs: number,
): (...args: T) => void {
  let lastRun = 0;
  let timeout: number | undefined;
  let lastArgs: T | null = null;

  return (...args: T) => {
    const now = Date.now();
    const elapsed = now - lastRun;
    lastArgs = args;
    window.clearTimeout(timeout);

    if (elapsed >= delayMs) {
      lastRun = now;
      callback(...args);
      lastArgs = null;
      return;
    }

    timeout = window.setTimeout(() => {
      if (lastArgs) {
        lastRun = Date.now();
        callback(...lastArgs);
        lastArgs = null;
      }
    }, delayMs - elapsed);
  };
}
