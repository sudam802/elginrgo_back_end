// routes/chat.js  (ESM version)
import { Router } from "express";
import Conversation from "../models/conversation.js";   // ESM default export
import { requireAuth } from "../middleware/authMiddleware.js";
import Friendship from "../models/friendship.js";

const router = Router();

/**
 * POST /api/chat/start
 * body: { partnerId: string }
 * returns: { conversationId: string }
 */
router.post("/start", requireAuth, async (req, res) => {
  try {
    // Use session-based auth (set by requireAuth)
    console.log("User ID from session:", req.session.userId);
    console.log("Incomming");
    const meId = String(req.session.userId);
    const partnerId = String(req.body?.partnerId || "");
    if (!partnerId) return res.status(400).json({ error: "partnerId is required" });
    if (partnerId === meId) {
      return res.status(400).json({ error: "Cannot start a chat with yourself" });
    }

    const [a, b] = [meId, partnerId].sort();
    const pairKey = `${a}_${b}`;

    const allowed = await Friendship.exists({ pairKey, status: "accepted" });
    if (!allowed) {
      return res.status(403).json({ error: "You can only message accepted friends" });
    }

    let conv = await Conversation.findOne({ pairKey });
    if (!conv) {
      conv = await Conversation.create({
        participants: [a, b],
        pairKey,
        lastMessageAt: null,
        lastMessageText: "",
      });
    }

    res.json({ conversationId: String(conv._id) });
  } catch (err) {
    console.error("POST /api/chat/start error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
