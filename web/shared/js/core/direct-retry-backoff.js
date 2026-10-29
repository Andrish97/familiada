export function createDirectRetryBackoff({ initialMs = 1_000, maxMs = 15_000, factor = 2 } = {}) {
  let nextMs = initialMs;
  return {
    nextDelay() {
      const delay = nextMs;
      nextMs = Math.min(maxMs, Math.round(nextMs * factor));
      return delay;
    },
    reset() { nextMs = initialMs; },
  };
}

export function createDirectRetryScheduler({
  run,
  isActive = () => true,
  isConnected = () => false,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
  initialMs = 1_000,
  maxMs = 15_000,
  factor = 2,
} = {}) {
  const backoff = createDirectRetryBackoff({ initialMs, maxMs, factor });
  let timer = null;
  return {
    schedule() {
      if (!isActive() || isConnected() || timer !== null) return null;
      const delay = backoff.nextDelay();
      timer = setTimer(() => {
        timer = null;
        if (isActive() && !isConnected()) run?.();
      }, delay);
      return delay;
    },
    cancel() {
      if (timer !== null) clearTimer(timer);
      timer = null;
    },
    reset() {
      this.cancel();
      backoff.reset();
    },
  };
}
