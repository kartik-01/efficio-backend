import mongoose from "mongoose";

const timeGoalSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, index: true },
    categoryId: {
      type: String,
      required: true,
      enum: ["work","learning","admin","health","personal","rest"],
    },
    period: { type: String, enum: ["daily","weekly"], required: true },
    targetMinutes: { type: Number, required: true, min: 1 },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// Prevent duplicates per user/category/period
timeGoalSchema.index({ userId: 1, categoryId: 1, period: 1 }, { unique: true });

export default mongoose.model("TimeGoal", timeGoalSchema);