import mongoose from "mongoose";

const userCategoryOverrideSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, index: true },
    pattern: { type: String, required: true, trim: true }, // simple substring/regex string
    categoryId: {
      type: String,
      required: true,
      enum: ["work","learning","admin","health","personal","rest"],
    },
  },
  { timestamps: true }
);

userCategoryOverrideSchema.index({ userId: 1, pattern: 1 }, { unique: true });

export default mongoose.model("UserCategoryOverride", userCategoryOverrideSchema);