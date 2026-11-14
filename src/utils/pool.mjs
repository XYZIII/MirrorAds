/**
 * Runs `work` over `items` with at most `limit` running at once and waits for
 * all of them. Never rejects: each outcome is `{ value }` or `{ error }`, in
 * the order of `items`, so the caller decides what a failure means once
 * nothing is still in flight.
 */
export async function runPool(items, limit, work) {
  const outcomes = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      try {
        outcomes[index] = { value: await work(items[index], index) };
      } catch (error) {
        outcomes[index] = { error };
      }
    }
  };
  await Promise.all(
    Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker),
  );
  return outcomes;
}
