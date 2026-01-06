import mongoose from "mongoose";

const { Schema, model, models } = mongoose;

const EventSchema = new Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, trim: true, maxlength: 1000 },
    sport: { type: String, trim: true, maxlength: 60 },
    startsAt: { type: Date, required: true, index: true },
    locationName: { type: String, trim: true, maxlength: 140 },
    locationGeo: {
      type: {
        type: String,
        enum: ["Point"],
      },
      coordinates: {
        type: [Number], // [lng, lat]
      },
    },
    visibility: {
      type: String,
      enum: ["public", "friends"],
      default: "public",
      index: true,
    },
    maxParticipants: { type: Number, default: 10, min: 2, max: 100 },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    participants: [{ type: Schema.Types.ObjectId, ref: "User", index: true }],
  },
  { timestamps: true }
);

EventSchema.index({ locationGeo: "2dsphere" });

const Event = models.Event || model("Event", EventSchema);
export default Event;

