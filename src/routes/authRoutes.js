import express from "express";
import bcrypt from "bcryptjs";
import User from "../models/User.js";

const router = express.Router();

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

// ---------------- Register ----------------
router.post("/register", async (req, res) => {
  try {
    const {
      fullName,
      username,
      email,
      password,
      location,
      locationCoords,
      preferredSports,
      skillLevel,
    } = req.body;

    if (!fullName || !String(fullName).trim()) {
      return res.status(400).json({ message: "Full name is required" });
    }
    if (!username || !String(username).trim()) {
      return res.status(400).json({ message: "Username is required" });
    }
    if (!email || !String(email).trim()) {
      return res.status(400).json({ message: "Email is required" });
    }
    if (!password || String(password).length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters" });
    }
    if (!location || !String(location).trim()) {
      return res.status(400).json({ message: "Location is required" });
    }

    const normalizedPreferredSports = Array.isArray(preferredSports)
      ? preferredSports.map((s) => String(s).trim()).filter(Boolean)
      : [];

    if (normalizedPreferredSports.length === 0) {
      return res.status(400).json({ message: "Preferred sports is required" });
    }

    const allowedSkillLevels = new Set(["beginner", "intermediate", "advanced", "pro"]);
    if (!skillLevel || !allowedSkillLevels.has(String(skillLevel))) {
      return res.status(400).json({ message: "Valid skill level is required" });
    }

    const normalizedEmail = String(email).toLowerCase().trim();
    const normalizedUsername = String(username).trim();

    // Check if user already exists
    const userExists = await User.findOne({ email: normalizedEmail });
    if (userExists) return res.status(400).json({ message: "User already exists" });

    const usernameExists = await User.findOne({ username: normalizedUsername });
    if (usernameExists) return res.status(400).json({ message: "Username already taken" });

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const user = await User.create({
      fullName: String(fullName).trim(),
      username: normalizedUsername,
      email: normalizedEmail,
      password: hashedPassword,
      location: String(location).trim(),
      locationGeo: parseLocationGeo(locationCoords) ?? undefined,
      preferredSports: normalizedPreferredSports,
      skillLevel: String(skillLevel),
    });

    // Store session
    req.session.userId = user._id;

    res.status(201).json({
      message: "User registered successfully",
      user: {
        id: user._id,
        fullName: user.fullName,
        username: user.username,
        email: user.email,
        location: user.location,
        locationCoords: coordsFromGeo(user.locationGeo),
        preferredSports: user.preferredSports,
        skillLevel: user.skillLevel,
      },
    });
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: err.message });
  }
});

// ---------------- Login ----------------
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email: String(email).toLowerCase().trim() });
    if (!user) return res.status(400).json({ message: "Invalid credentials" });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ message: "Invalid credentials" });

    // Set session
    req.session.userId = user._id;

    res.json({
      message: "Login successful",
      user: {
        id: user._id,
        fullName: user.fullName,
        username: user.username,
        email: user.email,
        location: user.location,
        locationCoords: coordsFromGeo(user.locationGeo),
        preferredSports: user.preferredSports,
        skillLevel: user.skillLevel,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------- Logout ----------------
router.post("/logout", (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("connect.sid");
    res.json({ message: "Logged out successfully" });
  });
});

router.get("/me", async (req, res) => {
  try {
    if (!req.session || !req.session.userId) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    const user = await User.findById(req.session.userId).select(
      "fullName username email location locationGeo preferredSports skillLevel"
    );
    if (!user) return res.status(404).json({ message: "User not found" });

    res.json({
      user: {
        id: user._id,
        fullName: user.fullName,
        username: user.username,
        email: user.email,
        location: user.location,
        locationCoords: coordsFromGeo(user.locationGeo),
        preferredSports: user.preferredSports,
        skillLevel: user.skillLevel,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


export default router;
