import express from "express";
import session from "express-session";
import MongoStore from "connect-mongo";
import cors from "cors";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import connectDB from "./config/db.js";
import authRoutes from "./routes/authRoutes.js";
import partnerRoutes from "./routes/partnerRoutes.js";
import chatRouter from "./routes/chat.js";
import placeholderRouter from "./routes/placeholder.js";
import friendsRoutes from "./routes/friendsRoutes.js";
import eventsRoutes from "./routes/eventsRoutes.js";
import feedRoutes from "./routes/feedRoutes.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../.env") }); // load back_end/.env regardless of CWD

// ---------------- CONFIG ----------------
const app = express();
const PORT = process.env.PORT || 5000;
const isProd = process.env.NODE_ENV === "production";
const FRONTEND_URL = process.env.FRONTEND_URL || (isProd ? "" : "http://localhost:3000");
const SESSION_SECRET = process.env.SESSION_SECRET || "change_this_secret";
const MONGO_URI = process.env.MONGO_URI;
const DEBUG_HTTP = String(process.env.DEBUG_HTTP || "").toLowerCase() === "true";
const DEBUG_CORS = String(process.env.DEBUG_CORS || "").toLowerCase() === "true";

function normalizeOrigin(value) {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) return null;
  if (raw === "*") return "*";
  try {
    return new URL(raw).origin;
  } catch {
    return raw.replace(/\/+$/, "");
  }
}

// ---------------- MIDDLEWARE ----------------
if (isProd) {
  // Required for secure cookies behind Render/other proxies
  app.set("trust proxy", 1);
}

if (DEBUG_HTTP) {
  app.use((req, res, next) => {
    const startedAt = Date.now();
    const origin = req.get("origin") || "-";
    const referer = req.get("referer") || "-";
    const ua = req.get("user-agent") || "-";
    const hasCookie = Boolean(req.headers.cookie);
    const hasAuth = Boolean(req.headers.authorization);
    console.log(
      `[HTTP] --> ${req.method} ${req.originalUrl} origin=${origin} referer=${referer} cookie=${hasCookie} auth=${hasAuth} ua=${ua}`
    );
    res.on("finish", () => {
      console.log(
        `[HTTP] <-- ${res.statusCode} ${req.method} ${req.originalUrl} ${Date.now() - startedAt}ms`
      );
    });
    next();
  });
}

const rawFrontendUrls = String(process.env.FRONTEND_URLS || FRONTEND_URL || "").trim();
const frontendOrigins = rawFrontendUrls
  ? rawFrontendUrls
      .split(",")
      .map(normalizeOrigin)
      .filter(Boolean)
  : [];
const corsAllowAll =
  String(process.env.CORS_ALLOW_ALL || "").toLowerCase() === "true" ||
  (isProd && frontendOrigins.length === 0);
if (isProd && corsAllowAll) {
  console.warn(
    "⚠️  CORS: allowing all origins because FRONTEND_URLS/FRONTEND_URL is not set (set FRONTEND_URLS to lock this down)."
  );
}

app.use(
  cors({
    origin: (origin, callback) => {
      // Non-browser clients (curl/postman) often send no Origin; allow those.
      if (!origin) {
        if (DEBUG_CORS) console.log(`[CORS] origin=<none> allow=true`);
        return callback(null, true);
      }

      // In dev, reflect the requesting origin to avoid localhost/port mismatches.
      if (!isProd) {
        if (DEBUG_CORS) console.log(`[CORS] origin=${origin} allow=true (dev)`);
        return callback(null, true);
      }

      if (corsAllowAll) {
        if (DEBUG_CORS) console.log(`[CORS] origin=${origin} allow=true (allow-all)`);
        return callback(null, true);
      }

      const normalized = normalizeOrigin(origin) || origin;
      if (frontendOrigins.includes("*") || frontendOrigins.includes(normalized)) {
        if (DEBUG_CORS) console.log(`[CORS] origin=${origin} normalized=${normalized} allow=true`);
        return callback(null, true);
      }
      if (DEBUG_CORS) {
        console.log(
          `[CORS] origin=${origin} normalized=${normalized} allow=false allowed=[${frontendOrigins.join(
            ", "
          )}]`
        );
      }
      return callback(null, false);
    },
    credentials: true, // allow cookies/sessions to be sent
  })
);
app.use(express.json()); // parse JSON body
app.use(express.urlencoded({ extended: true })); // parse form data

// serve uploaded media files (used by feed posts)
const uploadsDir = process.env.UPLOADS_DIR
  ? path.resolve(process.env.UPLOADS_DIR)
  : path.resolve(__dirname, "../uploads");
fs.mkdirSync(uploadsDir, { recursive: true });
app.use("/uploads", express.static(uploadsDir));

// ---------------- SESSION ----------------
const cookieSameSite = isProd ? "none" : "lax";


app.use(
  session({
    proxy: isProd,
    secret: SESSION_SECRET, // sign cookies
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({ mongoUrl: MONGO_URI }), // store sessions in MongoDB
    cookie: {
      maxAge: 1000 * 60 * 60 * 24, // 1 day
      httpOnly: true,              // prevent client-side JS from reading cookie
      sameSite: cookieSameSite,    // use "none" for cross-site frontend deployments
      secure: isProd,              // only HTTPS in production (requires trust proxy)
    },
  })
);

// ---------------- ROUTES ----------------
app.use("/api/auth", authRoutes);         // auth endpoints: /register, /login, etc.
app.use("/api/partners", partnerRoutes);  // partner endpoints: /find-partner
app.use("/api/friends", friendsRoutes);   // friend endpoints: /request, /accept, etc.
app.use("/api/events", eventsRoutes);     // events: create/list/join
app.use("/api/feed", feedRoutes);         // feed endpoints: list/create posts
app.use("/api/chat", chatRouter);
app.use("/api/placeholder", placeholderRouter); // placeholder images when original is missing

// health check
app.get("/health", (req, res) => res.json({ status: "ok" }));

// JSON 404 for API routes (prevents HTML "<!DOCTYPE ...>" responses)
app.use("/api", (req, res) => {
  res.status(404).json({ message: "Not found" });
});

// ---------------- ERROR HANDLER ----------------
app.use((err, req, res, next) => {
  console.error("🔥 Server Error:", err);
  res.status(500).json({ error: err.message });
});

// ---------------- START SERVER ----------------
const start = async () => {
  try {
    await connectDB(); // connect to MongoDB
    app.listen(PORT, () => {
      console.log(`🚀 Server listening on http://localhost:${PORT}`);
      console.log(`✅ Connected frontend: ${FRONTEND_URL}`);
    });
  } catch (err) {
    console.error("❌ Failed to start server:", err);
    process.exit(1);
  }
};

export default app;
