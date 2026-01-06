import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    fullName: {
      type: String,
      trim: true,
    },
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
    },
    password: {
      type: String,
      required: true,
      minlength: 6,
    },
   
    role: {
      type: String,
      enum: ["player", "coach", "admin"],
      default: "player",
    },
    age: Number,
    gender: {
      type: String,
      enum: ["male", "female", "other"],
    },
    sport: String,
    location: {
      type: String,
      trim: true,
    },
    locationGeo: {
      type: {
        type: String,
        enum: ["Point"],
      },
      coordinates: {
        type: [Number], // [lng, lat]
      },
    },
    preferredSports: {
      type: [String],
      default: [],
    },
    skillLevel: {
      type: String,
      enum: ["beginner", "intermediate", "advanced", "pro"],
    },
  },
  { timestamps: true }
);

userSchema.index({ locationGeo: "2dsphere" });

const User = mongoose.model("User", userSchema);
export default User;
