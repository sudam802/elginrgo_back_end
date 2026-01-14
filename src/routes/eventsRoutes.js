import { Router } from "express";
import mongoose from "mongoose";
import { requireAuth } from "../middleware/authMiddleware.js";
import Event from "../models/Event.js";
import EventLiveLocation from "../models/EventLiveLocation.js";
import Friendship from "../models/friendship.js";
import User from "../models/User.js";

const router = Router();

function toIdString(id) {
  return String(id ?? "");
}

function parseLocationGeo(locationCoords) {
  if (!locationCoords || typeof locationCoords !== "object") return null;
  const lat = Number(locationCoords.lat);
  const lng = Number(locationCoords.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { type: "Point", coordinates: [lng, lat] };
}

function coordsFromGeo(geo) {
  if (!geo || typeof geo !== "object") return null;
  const coords = geo.coordinates;
  if (!Array.isArray(coords) || coords.length !== 2) return null;
  const lng = Number(coords[0]);
  const lat = Number(coords[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

function parseLiveCoords(body) {
  const lat = Number(body?.lat);
  const lng = Number(body?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  const accuracy = body?.accuracy == null ? undefined : Number(body.accuracy);
  const heading = body?.heading == null ? undefined : Number(body.heading);
  const speed = body?.speed == null ? undefined : Number(body.speed);

  return {
    lat,
    lng,
    accuracy: Number.isFinite(accuracy) ? accuracy : undefined,
    heading: Number.isFinite(heading) ? heading : undefined,
    speed: Number.isFinite(speed) ? speed : undefined,
  };
}

async function requireEventParticipant(eventId, meId) {
  if (!mongoose.Types.ObjectId.isValid(eventId)) {
    return { ok: false, status: 400, message: "Invalid eventId" };
  }

  const event = await Event.findById(eventId).select("participants createdBy").lean();
  if (!event) return { ok: false, status: 404, message: "Event not found" };

  const participants = Array.isArray(event.participants) ? event.participants.map(toIdString) : [];
  const isParticipant = participants.includes(toIdString(meId));
  if (!isParticipant) return { ok: false, status: 403, message: "Not a participant" };

  return { ok: true, event };
}

async function acceptedFriendIds(meId) {
  const friendships = await Friendship.find({
    status: "accepted",
    participants: meId,
  })
    .select("participants")
    .lean();

  const ids = friendships
    .map((f) => (f.participants || []).map(toIdString))
    .map((parts) => parts.find((id) => id && id !== toIdString(meId)))
    .filter(Boolean);

  return ids;
}

// GET /api/events?scope=upcoming|all
router.get("/", requireAuth, async (req, res) => {
  try {
    const meId = toIdString(req.session.userId);
    const scope = String(req.query?.scope ?? "upcoming");
    const now = new Date();

    const friendIds = await acceptedFriendIds(meId);
    const visibleQuery = {
      $or: [
        { visibility: "public" },
        { visibility: "friends", createdBy: { $in: [meId, ...friendIds] } },
      ],
    };

    const timeQuery =
      scope === "all"
        ? {}
        : {
            startsAt: { $gte: now },
          };

    const events = await Event.find({ ...visibleQuery, ...timeQuery })
      .sort({ startsAt: 1 })
      .limit(50)
      .populate("createdBy", "username email")
      .lean();

    const users = await User.find({ _id: meId }).select("_id").lean();
    const myIdString = users[0]?._id ? toIdString(users[0]._id) : meId;

    const payload = events.map((e) => {
      const id = toIdString(e._id);
      const createdById = toIdString(e.createdBy?._id ?? e.createdBy);
      const participantIds = Array.isArray(e.participants) ? e.participants.map(toIdString) : [];
      const joined = participantIds.includes(myIdString);
      const owner = createdById === myIdString;
      return {
        id,
        title: e.title,
        description: e.description ?? "",
        sport: e.sport ?? "",
        startsAt: e.startsAt,
        locationName: e.locationName ?? "",
        locationCoords: coordsFromGeo(e.locationGeo),
        visibility: e.visibility,
        maxParticipants: e.maxParticipants,
        participantsCount: participantIds.length,
        joined,
        owner,
        createdBy: {
          id: createdById,
          username: e.createdBy?.username,
          email: e.createdBy?.email,
        },
      };
    });

    return res.json({ events: payload });
  } catch (err) {
    console.error("GET /api/events error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/events
router.post("/", requireAuth, async (req, res) => {
  try {
    const meId = toIdString(req.session.userId);
    const { title, description, sport, startsAt, locationName, locationCoords, visibility, maxParticipants } =
      req.body ?? {};

    if (!title || !String(title).trim()) {
      return res.status(400).json({ message: "Title is required" });
    }
    if (!startsAt) {
      return res.status(400).json({ message: "Start time is required" });
    }

    const startDate = new Date(startsAt);
    if (Number.isNaN(startDate.getTime())) {
      return res.status(400).json({ message: "Invalid start time" });
    }

    const vis = visibility === "friends" ? "friends" : "public";
    const max = Number.isFinite(Number(maxParticipants)) ? Number(maxParticipants) : 10;

    const event = await Event.create({
      title: String(title).trim(),
      description: description ? String(description).trim() : "",
      sport: sport ? String(sport).trim() : "",
      startsAt: startDate,
      locationName: locationName ? String(locationName).trim() : "",
      locationGeo: parseLocationGeo(locationCoords) ?? undefined,
      visibility: vis,
      maxParticipants: max,
      createdBy: meId,
      participants: [meId],
    });

    return res.status(201).json({ event: { id: toIdString(event._id) } });
  } catch (err) {
    console.error("POST /api/events error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/events/:eventId/join
router.post("/:eventId/join", requireAuth, async (req, res) => {
  try {
    const meId = toIdString(req.session.userId);
    const eventId = toIdString(req.params?.eventId).trim();
    if (!mongoose.Types.ObjectId.isValid(eventId)) {
      return res.status(400).json({ message: "Invalid eventId" });
    }

    const event = await Event.findById(eventId);
    if (!event) return res.status(404).json({ message: "Event not found" });

    // Visibility gate for "friends" events
    if (event.visibility === "friends") {
      const ownerId = toIdString(event.createdBy);
      if (ownerId !== meId) {
        const { pairKey } = (() => {
          const [a, b] = [meId, ownerId].sort();
          return { pairKey: `${a}_${b}` };
        })();
        const friendship = await Friendship.findOne({ pairKey, status: "accepted" }).lean();
        if (!friendship) {
          return res.status(403).json({ message: "Friends-only event" });
        }
      }
    }

    const participants = Array.isArray(event.participants)
      ? event.participants.map(toIdString)
      : [];

    if (participants.includes(meId)) {
      return res.json({ status: "joined" });
    }

    if (participants.length >= (event.maxParticipants ?? 10)) {
      return res.status(400).json({ message: "Event is full" });
    }

    event.participants.push(meId);
    await event.save();
    return res.json({ status: "joined" });
  } catch (err) {
    console.error("POST /api/events/:eventId/join error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/events/:eventId/leave
router.post("/:eventId/leave", requireAuth, async (req, res) => {
  try {
    const meId = toIdString(req.session.userId);
    const eventId = toIdString(req.params?.eventId).trim();
    if (!mongoose.Types.ObjectId.isValid(eventId)) {
      return res.status(400).json({ message: "Invalid eventId" });
    }

    const event = await Event.findById(eventId);
    if (!event) return res.status(404).json({ message: "Event not found" });

    const ownerId = toIdString(event.createdBy);
    if (ownerId === meId) {
      return res.status(400).json({ message: "Creator cannot leave their own event" });
    }

    event.participants = (event.participants || []).filter((p) => toIdString(p) !== meId);
    await event.save();

    // Best-effort cleanup of any live location for this event.
    try {
      await EventLiveLocation.deleteOne({ eventId, userId: meId });
    } catch {
      // ignore
    }
    return res.json({ status: "left" });
  } catch (err) {
    console.error("POST /api/events/:eventId/leave error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// PUT /api/events/:eventId/live-location
// Body: { lat, lng, accuracy?, heading?, speed? }
router.put("/:eventId/live-location", requireAuth, async (req, res) => {
  try {
    const meId = toIdString(req.session.userId);
    const eventId = toIdString(req.params?.eventId).trim();
    const coords = parseLiveCoords(req.body);
    if (!coords) return res.status(400).json({ message: "Invalid coordinates" });

    const guard = await requireEventParticipant(eventId, meId);
    if (!guard.ok) return res.status(guard.status).json({ message: guard.message });

    await EventLiveLocation.findOneAndUpdate(
      { eventId, userId: meId },
      {
        $set: {
          eventId,
          userId: meId,
          lat: coords.lat,
          lng: coords.lng,
          accuracy: coords.accuracy,
          heading: coords.heading,
          speed: coords.speed,
          updatedAt: new Date(),
        },
      },
      { upsert: true, new: false }
    );

    return res.json({ status: "ok" });
  } catch (err) {
    console.error("PUT /api/events/:eventId/live-location error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /api/events/:eventId/live-location
router.delete("/:eventId/live-location", requireAuth, async (req, res) => {
  try {
    const meId = toIdString(req.session.userId);
    const eventId = toIdString(req.params?.eventId).trim();
    const guard = await requireEventParticipant(eventId, meId);
    if (!guard.ok) return res.status(guard.status).json({ message: guard.message });

    await EventLiveLocation.deleteOne({ eventId, userId: meId });
    return res.json({ status: "ok" });
  } catch (err) {
    console.error("DELETE /api/events/:eventId/live-location error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/events/:eventId/live-locations
// Optional query: sinceSeconds=120
router.get("/:eventId/live-locations", requireAuth, async (req, res) => {
  try {
    const meId = toIdString(req.session.userId);
    const eventId = toIdString(req.params?.eventId).trim();
    const guard = await requireEventParticipant(eventId, meId);
    if (!guard.ok) return res.status(guard.status).json({ message: guard.message });

    const sinceSecondsRaw = Number(req.query?.sinceSeconds ?? 120);
    const sinceSeconds = Number.isFinite(sinceSecondsRaw) ? Math.max(5, Math.min(600, sinceSecondsRaw)) : 120;
    const since = new Date(Date.now() - sinceSeconds * 1000);

    const docs = await EventLiveLocation.find({
      eventId,
      updatedAt: { $gte: since },
    })
      .sort({ updatedAt: -1 })
      .limit(100)
      .lean();

    const userIds = docs.map((d) => toIdString(d.userId)).filter(Boolean);
    const users = userIds.length
      ? await User.find({ _id: { $in: userIds } }).select("_id username email").lean()
      : [];

    const byId = new Map(users.map((u) => [toIdString(u._id), u]));

    const locations = docs.map((d) => {
      const userId = toIdString(d.userId);
      const user = byId.get(userId);
      return {
        userId,
        username: user?.username || user?.email || "Player",
        lat: d.lat,
        lng: d.lng,
        accuracy: d.accuracy ?? null,
        heading: d.heading ?? null,
        speed: d.speed ?? null,
        updatedAt: d.updatedAt,
        isMe: userId === toIdString(meId),
      };
    });

    return res.json({ eventId, sinceSeconds, locations });
  } catch (err) {
    console.error("GET /api/events/:eventId/live-locations error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
