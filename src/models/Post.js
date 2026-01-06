import mongoose from "mongoose";

const { Schema, model, models } = mongoose;

const MediaSchema = new Schema(
  {
    type: { type: String, enum: ["image", "video"], required: true },
    url: { type: String, required: true, trim: true },
  },
  { _id: false }
);

const PostSchema = new Schema(
  {
    author: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    text: { type: String, trim: true, maxlength: 2000, default: "" },
    media: { type: MediaSchema, default: null },
    visibility: { type: String, enum: ["friends", "public"], default: "friends", index: true },
  },
  { timestamps: true }
);

PostSchema.index({ createdAt: -1 });

const Post = models.Post || model("Post", PostSchema);
export default Post;

