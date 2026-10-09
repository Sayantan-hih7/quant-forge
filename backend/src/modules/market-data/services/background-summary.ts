/** Expensive inventory scans never hold up connection status or overlap polls. */
export function backgroundSummary<T>(load: () => Promise<T>, now = Date.now) {
  let value: T | undefined;
  let updatedAt: string | undefined;
  let pending = false;
  let failed = false;
  let nextRefresh = 0;
  return {
    read() {
      if (!pending && now() >= nextRefresh) {
        pending = true;
        failed = false;
        void Promise.resolve().then(load).then(result => {
          value = result;
          updatedAt = new Date(now()).toISOString();
          nextRefresh = now() + 5 * 60_000;
        }, () => {
          failed = true;
          nextRefresh = now() + 60_000;
        }).finally(() => { pending = false; });
      }
      return { value, status: { state: pending ? 'refreshing' : failed ? 'unavailable' : 'ready', updatedAt } };
    },
  };
}
