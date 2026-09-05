export function createSaveQueue<T>(write: (value: T) => Promise<unknown>) {
  let pending: { value: T } | undefined;
  let inFlight: Promise<void> | undefined;

  return {
    stage(value: T): void {
      pending = { value };
    },
    flush(): Promise<void> {
      if (inFlight) return inFlight;
      if (!pending) return Promise.resolve();

      // Keep the snapshot until acknowledgement; newer edits must survive it too.
      const drain = async () => {
        while (pending) {
          const snapshot = pending;
          await write(snapshot.value);
          if (pending === snapshot) pending = undefined;
        }
      };
      inFlight = drain().finally(() => {
        inFlight = undefined;
      });
      return inFlight;
    },
  };
}
