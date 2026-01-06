// models/friendship.js (ESM)
import mongoose from "mongoose";

const { Schema, model, models } = mongoose;

const FriendshipSchema = new Schema(
  {
    // a unique, deterministic key for a 1:1 pair: "<smallerId>_<largerId>"
    pairKey: { type: String, unique: true, index: true },
    participants: [
      { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    ],
    requester: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    addressee: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    status: { type: String, enum: ["pending", "accepted"], default: "pending", index: true },
  },
  { timestamps: true }
);

const Friendship = models.Friendship || model("Friendship", FriendshipSchema);
export default Friendship;

