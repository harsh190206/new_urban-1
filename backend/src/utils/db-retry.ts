/**
 * Retries a database call once on a transient connection failure.
 *
 * The Neon endpoint this project talks to sits behind an IPv6-only address,
 * and connections to it from this environment are measurably flaky: the same
 * pool, same connection string, sometimes connects in ~5s and sometimes fails
 * in under a second — reproduced directly, back to back, with no code change
 * in between. That is a transient network condition, not a broken query, so a
 * single retry is the correct response — not a longer timeout, which does
 * nothing for a fast failure, and not surfacing it to the user, who has no way
 * to act on "the database was briefly unreachable".
 *
 * Only network/connection-shaped errors are retried. A real query error (bad
 * SQL, constraint violation, etc.) fails immediately — retrying it would just
 * waste time reproducing the same failure.
 */
const TRANSIENT_ERROR_CODES = new Set([
  "ETIMEDOUT",
  "ECONNRESET",
  "ECONNREFUSED",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "P1001", // Prisma: can't reach database server
  "P1002", // Prisma: database server was reached but timed out
  "P1017", // Prisma: server closed the connection
]);

function isTransient(err: unknown): boolean {
  const code = (err as { code?: string })?.code;
  if (code && TRANSIENT_ERROR_CODES.has(code)) return true;

  // The pg driver adapter wraps the original node-postgres error instead of
  // surfacing its code directly (see src/utils/prisma-errors.ts for the same
  // shape on the write path).
  const adapterCode = (
    err as {
      meta?: { driverAdapterError?: { cause?: { originalCode?: string } } };
    }
  )?.meta?.driverAdapterError?.cause?.originalCode;
  return !!adapterCode && TRANSIENT_ERROR_CODES.has(adapterCode);
}

// Measured directly against this project's database: bad windows are bursty,
// not single blips — a query that fails keeps failing for a few seconds
// straight, so one quick retry lands in the same bad window and fails too.
// Three attempts with growing gaps give a bad window room to pass before
// giving up for real.
const RETRY_DELAYS_MS = [300, 1000, 2500];

export async function withDbRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (!isTransient(err) || attempt >= RETRY_DELAYS_MS.length) throw err;
      console.warn(
        `[db-retry] transient connection failure (attempt ${attempt + 1}/${RETRY_DELAYS_MS.length}), retrying:`,
        (err as Error).message,
      );
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[attempt]));
    }
  }
}
