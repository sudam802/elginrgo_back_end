import User from "../models/User.js";
import mongoose from "mongoose";

export const getPartners = async (userId) => {
  const currentUser = await User.findById(userId).select("locationGeo");

  const geo = currentUser?.locationGeo;
  const hasGeo =
    geo &&
    typeof geo === "object" &&
    geo.type === "Point" &&
    Array.isArray(geo.coordinates) &&
    geo.coordinates.length === 2 &&
    Number.isFinite(Number(geo.coordinates[0])) &&
    Number.isFinite(Number(geo.coordinates[1]));

  if (hasGeo) {
    const near = { type: "Point", coordinates: geo.coordinates.map(Number) };
    const partners = await User.aggregate([
      {
        $geoNear: {
          near,
          key: "locationGeo",
          distanceField: "distanceMeters",
          spherical: true,
          query: { _id: { $ne: new mongoose.Types.ObjectId(userId) } },
        },
      },
      { $limit: 10 },
      { $project: { username: 1, email: 1, distanceMeters: 1 } },
    ]);

    return partners;
  }

  // fallback: exclude current user, return others
  const partners = await User.find({ _id: { $ne: userId } }).select("username email").limit(10);

  return partners;
};
