// models/conversation.js (ESM)
import mongoose from "mongoose";

const { Schema, model, models } = mongoose;

const ConversationSchema = new Schema(
  {
    participants: [
      { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    ],
    // a unique, deterministic key for a 1:1 pair: "<smallerId>_<largerId>"
    pairKey: { type: String, unique: true, index: true },
    lastMessageAt: { type: Date, index: true },
    lastMessageText: { type: String, default: "" },
  },
  { timestamps: true }
);

const Conversation =
  models.Conversation || model("Conversation", ConversationSchema);

export default Conversation;
