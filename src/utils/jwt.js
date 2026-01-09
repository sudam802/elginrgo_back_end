import jwt from "jsonwebtoken";

const JWT_SECRET =
  process.env.JWT_SECRET || process.env.SESSION_SECRET || "change_this_secret";
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "30d";

export function signAuthToken(userId) {
  return jwt.sign({ sub: String(userId) }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

export function verifyAuthToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

