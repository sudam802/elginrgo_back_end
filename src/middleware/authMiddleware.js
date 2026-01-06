export const requireAuth = (req, res, next) => {
  try {
    if (req.session && req.session.userId) return next();
    return res.status(401).json({ message: "Not authenticated" });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};