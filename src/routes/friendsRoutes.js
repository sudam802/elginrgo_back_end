import { Router } from "express";
import mongoose from "mongoose";
import User from "../models/User.js";
import Friendship from "../models/friendship.js";
import { requireAuth } from "../middleware/authMiddleware.js";

const router = Router();

function toIdString(id) {
  return String(id ?? "");
}

function makePairKey(aId, bId) {
  const [a, b] = [toIdString(aId), toIdString(bId)].sort();
  return { a, b, pairKey: `${a}_${b}` };
}

function publicUser(user) {
  return {
    id: user._id,
    _id: user._id,
    username: user.username,
    email: user.email,
  };
}

function publicSuggestionUser(user) {
  return {
    id: user._id,
    _id: user._id,
    username: user.username,
    fullName: user.fullName,
    location: user.location,
    preferredSports: user.preferredSports ?? [],
    skillLevel: user.skillLevel,
  };
}

// GET /api/friends/status?userId=<id>
// returns: { status: "none" | "pending_outgoing" | "pending_incoming" | "accepted", canMessage: boolean }
router.get("/status", requireAuth, async (req, res) => {
  try {
    const meId = toIdString(req.session.userId);
    const otherId = toIdString(req.query?.userId).trim();
    if (!otherId) return res.status(400).json({ message: "Missing userId" });
    if (otherId === meId) return res.json({ status: "accepted", canMessage: true });
    if (!mongoose.Types.ObjectId.isValid(otherId)) {
      return res.status(400).json({ message: "Invalid userId" });
    }

    const { pairKey } = makePairKey(meId, otherId);
    const friendship = await Friendship.findOne({ pairKey }).lean();
    if (!friendship) return res.json({ status: "none", canMessage: false });

    if (friendship.status === "accepted") {
      return res.json({ status: "accepted", canMessage: true });
    }

    const requester = toIdString(friendship.requester);
    const addressee = toIdString(friendship.addressee);
    if (requester === meId && addressee === otherId) {
      return res.json({ status: "pending_outgoing", canMessage: false });
    }
    if (addressee === meId && requester === otherId) {
      return res.json({ status: "pending_incoming", canMessage: false });
    }

    return res.json({ status: "none", canMessage: false });
  } catch (err) {
    console.error("GET /api/friends/status error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/friends
router.get("/", requireAuth, async (req, res) => {
  try {
    const meId = toIdString(req.session.userId);
    const friendships = await Friendship.find({ status: "accepted", participants: meId }).lean();

    const friendIds = friendships
      .map((f) => (f.participants || []).map(toIdString))
      .map((ids) => ids.find((id) => id && id !== meId))
      .filter(Boolean);

    const friends = await User.find({ _id: { $in: friendIds } }).select("username email").lean();
    return res.json({ friends: friends.map((u) => publicUser(u)) });
  } catch (err) {
    console.error("GET /api/friends error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/friends/requests
router.get("/requests", requireAuth, async (req, res) => {
  try {
    const meId = toIdString(req.session.userId);
    const requests = await Friendship.find({ status: "pending", addressee: meId })
      .populate("requester", "username email")
      .sort({ createdAt: -1 })
      .lean();

    return res.json({
      requests: requests
        .filter((r) => r.requester)
        .map((r) => ({ from: publicUser(r.requester), createdAt: r.createdAt })),
    });
  } catch (err) {
    console.error("GET /api/friends/requests error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/friends/request { userId }
router.post("/request", requireAuth, async (req, res) => {
  try {
    const meId = toIdString(req.session.userId);
    const targetId = toIdString(req.body?.userId).trim();
    if (!targetId) return res.status(400).json({ message: "Missing userId" });
    if (targetId === meId) return res.status(400).json({ message: "Cannot add yourself" });
    if (!mongoose.Types.ObjectId.isValid(targetId)) {
      return res.status(400).json({ message: "Invalid userId" });
    }

    const targetExists = await User.exists({ _id: targetId });
    if (!targetExists) return res.status(404).json({ message: "User not found" });

    const { pairKey } = makePairKey(meId, targetId);
    const existing = await Friendship.findOne({ pairKey });

    if (existing) {
      if (existing.status === "accepted") return res.json({ status: "accepted" });
      if (existing.status === "pending") {
        if (toIdString(existing.requester) === meId) return res.json({ status: "pending" });
        if (toIdString(existing.addressee) === meId) {
          existing.status = "accepted";
          await existing.save();
          return res.json({ status: "accepted" });
        }
        return res.json({ status: "pending" });
      }
    }

    try {
      await Friendship.create({
        pairKey,
        participants: [meId, targetId],
        requester: meId,
        addressee: targetId,
        status: "pending",
      });
      return res.status(201).json({ status: "pending" });
    } catch (createErr) {
      if (createErr?.code === 11000) {
        const doc = await Friendship.findOne({ pairKey }).lean();
        if (doc?.status === "accepted") return res.json({ status: "accepted" });
        return res.json({ status: "pending" });
      }
      throw createErr;
    }
  } catch (err) {
    console.error("POST /api/friends/request error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/friends/accept { userId }
router.post("/accept", requireAuth, async (req, res) => {
  try {
    const meId = toIdString(req.session.userId);
    const fromUserId = toIdString(req.body?.userId).trim();
    if (!fromUserId) return res.status(400).json({ message: "Missing userId" });
    if (!mongoose.Types.ObjectId.isValid(fromUserId)) {
      return res.status(400).json({ message: "Invalid userId" });
    }

    const { pairKey } = makePairKey(meId, fromUserId);
    const friendship = await Friendship.findOne({ pairKey });
    if (!friendship) return res.status(404).json({ message: "Request not found" });
    if (friendship.status === "accepted") return res.json({ status: "accepted" });

    if (toIdString(friendship.addressee) !== meId || toIdString(friendship.requester) !== fromUserId) {
      return res.status(403).json({ message: "Not allowed" });
    }

    friendship.status = "accepted";
    await friendship.save();
    return res.json({ status: "accepted" });
  } catch (err) {
    console.error("POST /api/friends/accept error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/friends/suggestions?limit=6
router.get("/suggestions", requireAuth, async (req, res) => {
  try {
    const meId = toIdString(req.session.userId);
    const limitRaw = Number(req.query?.limit ?? 6);
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(20, limitRaw)) : 6;

    const me = await User.findById(meId)
      .select("preferredSports skillLevel")
      .lean();

    const friendships = await Friendship.find({ participants: meId })
      .select("participants")
      .lean();

    const excluded = new Set([meId]);
    for (const f of friendships) {
      for (const pid of f.participants || []) excluded.add(toIdString(pid));
    }

    const preferred = Array.isArray(me?.preferredSports)
      ? me.preferredSports.map((s) => String(s).trim()).filter(Boolean)
      : [];
    const skillLevel = me?.skillLevel ? String(me.skillLevel) : null;

    const baseQuery = {
      _id: { $nin: Array.from(excluded).filter((id) => mongoose.Types.ObjectId.isValid(id)) },
    };

    const suggestions = [];
    const pickedIds = new Set();

    // 1) Prefer matches by overlapping preferred sports (when available)
    if (preferred.length) {
      const candidates = await User.find({ ...baseQuery, preferredSports: { $in: preferred } })
        .select("username fullName location preferredSports skillLevel createdAt")
        .limit(50)
        .lean();

      const scored = candidates
        .map((u) => {
          const sports = Array.isArray(u.preferredSports) ? u.preferredSports.map(String) : [];
          const overlap = sports.filter((s) => preferred.includes(s)).length;
          const skillBonus = skillLevel && String(u.skillLevel) === skillLevel ? 1 : 0;
          return { user: u, score: overlap * 10 + skillBonus };
        })
        .sort((a, b) => {
          if (b.score !== a.score) return b.score - a.score;
          const bt = new Date(b.user.createdAt ?? 0).getTime();
          const at = new Date(a.user.createdAt ?? 0).getTime();
          return bt - at;
        });

      for (const x of scored) {
        const id = toIdString(x.user?._id);
        if (!id || pickedIds.has(id)) continue;
        pickedIds.add(id);
        suggestions.push(publicSuggestionUser(x.user));
        if (suggestions.length >= limit) break;
      }
    }

    // 2) If not enough matches, fill with newest users (still excluding friends/requests)
    if (suggestions.length < limit) {
      const remaining = limit - suggestions.length;
      const fillQuery = {
        ...baseQuery,
        _id: {
          $nin: Array.from(
            new Set([
              ...Array.from(excluded).filter((id) => mongoose.Types.ObjectId.isValid(id)),
              ...Array.from(pickedIds).filter((id) => mongoose.Types.ObjectId.isValid(id)),
            ])
          ),
        },
      };

      const recent = await User.find(fillQuery)
        .select("username fullName location preferredSports skillLevel createdAt")
        .sort({ createdAt: -1 })
        .limit(remaining)
        .lean();

      for (const u of recent) {
        const id = toIdString(u?._id);
        if (!id || pickedIds.has(id)) continue;
        pickedIds.add(id);
        suggestions.push(publicSuggestionUser(u));
        if (suggestions.length >= limit) break;
      }
    }

    return res.json({ suggestions });
  } catch (err) {
    console.error("GET /api/friends/suggestions error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
