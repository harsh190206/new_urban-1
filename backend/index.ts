import "dotenv/config";
import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { pool, prisma } from "./db";
import authRoutes from "./src/routes/auth.routes";
import uploadRoutes from "./src/routes/upload.routes";
import userRouter from "./src/routes/user.routes";
import agentRouter from "./src/routes/agent.routes";
import adminRouter from "./src/routes/admin.routes";
import { env } from "./src/config/env";

const app = express();

// ─── Security headers ──────────────────────────────────────────────────
app.use(helmet());

// ─── Trust proxy (needed for correct IP behind nginx / reverse proxy) ──
app.set("trust proxy", 1);

// ─── Body parsing ──────────────────────────────────────────────────────
app.use(express.json({ limit: "10kb" })); // prevent large payload attacks

// ─── CORS ──────────────────────────────────────────────────────────────
app.use((_req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header(
    "Access-Control-Allow-Methods",
    "GET,POST,PUT,PATCH,DELETE,OPTIONS",
  );
  res.header("Access-Control-Allow-Headers", "Content-Type,Authorization");
  if (_req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }
  next();
});

// ─── Rate limiters ─────────────────────────────────────────────────────

// Global: 100 requests per minute per IP
const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many requests, slow down. Try again in a minute." },
});

// Auth: allow normal retries, but still slow down repeated abuse per IP
const authLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 25,
  skipSuccessfulRequests: true,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many auth attempts. Try again after 5 minutes." },
});

// Uploads: 20 per 10 min per IP
const uploadLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many uploads. Try again later." },
});

app.use(globalLimiter);

// ─── Routes ────────────────────────────────────────────────────────────
app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/auth", authLimiter, authRoutes);
app.use("/api/upload", uploadLimiter, uploadRoutes);
app.use("/api/users", userRouter);
app.use("/api/agents", agentRouter);
app.use("/api/admin", adminRouter);

// ─── Public Routes (no auth) ──────────────────────────────────────────
app.get("/api/public/settings", async (_req, res) => {
  try {
    const settings = await prisma.siteSettings.findMany();
    const settingsMap: Record<string, string> = {};
    for (const s of settings) {
      settingsMap[s.key] = s.value;
    }
    res.json({ settings: settingsMap });
  } catch {
    res.status(500).json({ error: "Something went wrong" });
  }
});

app.get("/api/public/faqs", async (_req, res) => {
  try {
    const faqs = await prisma.fAQ.findMany({
      where: { isActive: true },
      orderBy: { order: "asc" },
      select: { id: true, question: true, answer: true },
    });
    res.json({ faqs });
  } catch {
    res.status(500).json({ error: "Something went wrong" });
  }
});

app.listen(Number(env.PORT), () => {
  console.log(`Server running on port ${env.PORT}`);
});

process.on("SIGTERM", async () => {
  await pool.end();
  process.exit(0);
});
