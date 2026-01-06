import { Router } from "express";
import crypto from "crypto";
import fs from "fs";
import mongoose from "mongoose";
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";
import { requireAuth } from "../middleware/authMiddleware.js";
import Friendship from "../models/friendship.js";
import Post from "../models/Post.js";

const router = Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsDir = process.env.UPLOADS_DIR
  ? path.resolve(process.env.UPLOADS_DIR)
  : path.resolve(__dirname, "../../uploads");
fs.mkdirSync(uploadsDir, { recursive: true });

function extFromMimetype(mimetype) {
  switch (mimetype) {
    case "image/jpeg":
      return ".jpg";
    case "image/png":
      return ".png";
    case "image/gif":
      return ".gif";
    case "image/webp":
      return ".webp";
    case "image/avif":
      return ".avif";
    case "video/mp4":
      return ".mp4";
    case "video/webm":
      return ".webm";
    case "video/quicktime":
      return ".mov";
    default:
      return "";
  }
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const meId = toIdString(req?.session?.userId);
      const safeFolder = mongoose.Types.ObjectId.isValid(meId) ? meId : "unknown";
      const userDir = path.join(uploadsDir, safeFolder);
      fs.mkdirSync(userDir, { recursive: true });
      cb(null, userDir);
    },
    filename: (req, file, cb) => {
      const ext = extFromMimetype(file.mimetype) || path.extname(file.originalname || "").toLowerCase();
      const safeExt = /^[a-z0-9.]+$/i.test(ext) ? ext : "";
      const name = `${Date.now()}-${crypto.randomBytes(8).toString("hex")}${safeExt}`;
      cb(null, name);
    },
  }),
  fileFilter: (req, file, cb) => {
    const type = String(file.mimetype || "");
    const ok = type.startsWith("image/") || type.startsWith("video/");
    if (ok) return cb(null, true);
    const err = new Error("UNSUPPORTED_MEDIA_TYPE");
    return cb(err, false);
  },
  limits: {
    fileSize: 150 * 1024 * 1024, // 150MB
  },
});

function parseMediaUpload(req, res, next) {
  upload.single("media")(req, res, (err) => {
    if (!err) return next();
    if (err instanceof multer.MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(413).json({ message: "Media file is too large (max 150MB)" });
      }
      return res.status(400).json({ message: "Invalid media upload" });
    }
    if (String(err?.message || "") === "UNSUPPORTED_MEDIA_TYPE") {
      return res.status(415).json({ message: "Only image/video files are supported" });
    }
    return res.status(400).json({ message: "Invalid media upload" });
  });
}

function toIdString(id) {
  return String(id ?? "");
}

async function acceptedFriendIds(meId) {
  const friendships = await Friendship.find({
    status: "accepted",
    participants: meId,
  })
    .select("participants")
    .lean();

  return friendships
    .map((f) => (f.participants || []).map(toIdString))
    .map((ids) => ids.find((id) => id && id !== toIdString(meId)))
    .filter(Boolean);
}

function inferMediaTypeFromUrl(url) {
  const lower = String(url).toLowerCase();
  if (lower.includes(".mp4") || lower.includes(".webm") || lower.includes(".mov") || lower.includes(".m4v")) {
    return "video";
  }
  return "image";
}

function normalizeMedia(body) {
  const mediaUrl = typeof body?.mediaUrl === "string" ? body.mediaUrl.trim() : "";
  if (!mediaUrl) return null;

  const allowed = new Set(["image", "video"]);
  const rawType = typeof body?.mediaType === "string" ? body.mediaType.trim().toLowerCase() : "";
  const type = allowed.has(rawType) ? rawType : inferMediaTypeFromUrl(mediaUrl);

  const okUrl =
    mediaUrl.startsWith("/") ||
    (() => {
      try {
        const parsed = new URL(mediaUrl);
        return parsed.protocol === "http:" || parsed.protocol === "https:";
      } catch {
        return false;
      }
    })();

  if (!okUrl) return null;
  return { type, url: mediaUrl };
}

function publicPost(p) {
  const authorId = toIdString(p.author?._id ?? p.author);
  return {
    id: toIdString(p._id),
    text: p.text ?? "",
    media: p.media
      ? {
          type: p.media.type,
          url: p.media.url,
        }
      : null,
    visibility: p.visibility,
    createdAt: p.createdAt,
    author: {
      id: authorId,
      username: p.author?.username,
      fullName: p.author?.fullName,
    },
  };
}

function mediaFromUploadedFile(file) {
  if (!file) return null;
  const type = String(file.mimetype || "").startsWith("video/") ? "video" : "image";
  const abs = path.join(file.destination, file.filename);
  const rel = path.relative(uploadsDir, abs).split(path.sep).join("/");
  return { type, url: `/uploads/${rel}` };
}

// GET /api/feed?limit=50
router.get("/", requireAuth, async (req, res) => {
  try {
    const meId = toIdString(req.session.userId);
    const limitRaw = Number(req.query?.limit ?? 50);
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(50, limitRaw)) : 50;

    const friendIds = await acceptedFriendIds(meId);
    const visibleAuthorIds = [meId, ...friendIds].filter((id) => mongoose.Types.ObjectId.isValid(id));

    const posts = await Post.find({
      $or: [{ visibility: "public" }, { author: { $in: visibleAuthorIds } }],
    })
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate("author", "username fullName")
      .lean();

    return res.json({ posts: posts.map(publicPost) });
  } catch (err) {
    console.error("GET /api/feed error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/feed
// - JSON: { text?, mediaUrl?, mediaType?, visibility? }
// - multipart/form-data: fields { text?, visibility? } + file "media"
router.post("/", requireAuth, parseMediaUpload, async (req, res) => {
  try {
    const meId = toIdString(req.session.userId);
    if (!mongoose.Types.ObjectId.isValid(meId)) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";
    const media = mediaFromUploadedFile(req.file) ?? normalizeMedia(req.body);

    if (!text && !media) {
      return res.status(400).json({ message: "Post text or media is required" });
    }

    const vis = req.body?.visibility === "public" ? "public" : "friends";
    const post = await Post.create({
      author: meId,
      text,
      media,
      visibility: vis,
    });

    return res.status(201).json({ post: { id: toIdString(post._id) } });
  } catch (err) {
    console.error("POST /api/feed error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
