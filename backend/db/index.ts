import net from "node:net";
import dns from "node:dns";
import { PrismaClient } from "./src/generated/prisma/client.ts";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import "dotenv/config";

// ─── Connection reliability ────────────────────────────────────────────────
//
// The Neon host resolves to three IPv4 and three IPv6 addresses. Connecting
// used to fail most of the time, with an AggregateError carrying ECONNREFUSED
// for every IPv6 address and ETIMEDOUT for every IPv4 one — after only ~750ms,
// nowhere near the connect timeout below.
//
// The cause is Happy Eyeballs (`autoSelectFamily`), which races the addresses
// and allows each attempt just 250ms by default. Neon's TCP handshake does not
// finish that fast, so every IPv4 address was abandoned mid-connect and the
// whole attempt failed once the list ran out.
//
// Two changes, measured A/B in one process: defaults gave 1 success in 5,
// these settings gave 5 in 5.
//   - ipv4first — this deployment's IPv6 path is unusable (its addresses are
//     `deprecated` and even ping6 reports the network as unreachable), so try
//     the family that actually works first instead of burning attempts on it.
//   - a 5s per-address window — long enough for Neon to complete a handshake,
//     while still failing over to the next address rather than hanging.
//
// These are process-wide settings, which is why they live here, in the module
// every database consumer (server and standalone scripts alike) imports.
dns.setDefaultResultOrder("ipv4first");
net.setDefaultAutoSelectFamilyAttemptTimeout(5_000);

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  // Establishing a connection to this database costs 2.5-5s (cross-region
  // round trips plus waking a suspended Neon compute), while reusing a pooled
  // one answers in 0.3-1.3s — measured, with the connection surviving both a
  // 30s and a 60s idle period. Recycling every 10s therefore made almost every
  // request pay full connection setup for no benefit. A minute keeps
  // connections warm across a signup flow while still retiring them often
  // enough that Neon's own idle handling stays uneventful; withDbRetry covers
  // the case where one is closed underneath us anyway.
  idleTimeoutMillis: 60_000,
  // Waking a suspended Neon compute takes several seconds on the first
  // connection. 10s cut that wake off mid-connect and turned an ordinary cold
  // start into a 503; once the compute is warm, connects are quick regardless.
  connectionTimeoutMillis: 20_000,
});

// Required: an idle client's connection can be torn down by the server
// (Neon suspend, network blip) between queries. Without a listener here, that
// surfaces as an unhandled 'error' event on the pool instead of being retried
// on the next checkout — logging it is enough, the pool already discards the
// dead client itself.
pool.on("error", (err) => {
  console.error("[pg pool] idle client error:", err.message);
});

const adapter = new PrismaPg(pool);

// Cast is required because getPrismaClientClass() is in a @ts-nocheck file,
// which causes TypeScript to lose the full generated return type.
export const prisma = new PrismaClient({ adapter }) as unknown as PrismaClient;
export { pool };
