/**
 * Returns the field name a unique-constraint violation was raised on, or null
 * when the error is something else.
 *
 * Prisma reports these as code P2002, but where the offending column is
 * recorded depends on how the client talks to the database:
 *   - driver adapter (our setup, @prisma/adapter-pg):
 *       meta.driverAdapterError.cause.constraint.fields
 *   - built-in query engine:
 *       meta.target
 * Both are read, so this keeps working if the adapter is ever dropped. Matching
 * on structured metadata rather than the message text keeps it stable across
 * Prisma versions and database locales.
 */
export function duplicateField(err: unknown): string | null {
  const e = err as {
    code?: string;
    meta?: {
      target?: string[] | string;
      driverAdapterError?: { cause?: { constraint?: { fields?: string[] } } };
    };
  };
  if (e?.code !== "P2002") return null;

  const adapterFields = e.meta?.driverAdapterError?.cause?.constraint?.fields;
  if (Array.isArray(adapterFields) && adapterFields.length > 0) {
    return adapterFields[0]!;
  }

  const target = e.meta?.target;
  if (Array.isArray(target)) return target[0] ?? "unknown";
  if (typeof target === "string") return target;
  return "unknown";
}
