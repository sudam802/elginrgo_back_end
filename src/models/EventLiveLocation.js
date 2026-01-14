import mongoose from "mongoose";

const { Schema, model, models } = mongoose;

const EventLiveLocationSchema = new Schema(
  {
    eventId: { type: Schema.Types.ObjectId, ref: "Event", required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    lat: { type: Number, required: true, min: -90, max: 90 },
    lng: { type: Number, required: true, min: -180, max: 180 },
    accuracy: { type: Number },
    heading: { type: Number },
    speed: { type: Number },
  },
  { timestamps: true }
);

EventLiveLocationSchema.index({ eventId: 1, userId: 1 }, { unique: true });
EventLiveLocationSchema.index({ updatedAt: 1 }, { expireAfterSeconds: 60 * 60 * 6 }); // 6h TTL

const EventLiveLocation = models.EventLiveLocation || model("EventLiveLocation", EventLiveLocationSchema);
export default EventLiveLocation;

