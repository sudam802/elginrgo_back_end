import { verifyAuthToken } from "../utils/jwt.js";

export const requireAuth = (req, res, next) => {
  try {
    if (req.session && req.session.userId) return next();

    const authHeader = String(req.headers?.authorization ?? "").trim();
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    if (!match) return res.status(401).json({ message: "Not authenticated" });

    const token = match[1];
    const payload = verifyAuthToken(token);
    const userId = payload?.sub ? String(payload.sub) : "";
    if (!userId) return res.status(401).json({ message: "Not authenticated" });

    // Keep existing routes working (they read req.session.userId)
    if (req.session) req.session.userId = userId;
    req.userId = userId;

    return next();
  } catch (err) {
    return res.status(401).json({ message: "Not authenticated" });
  }
};
