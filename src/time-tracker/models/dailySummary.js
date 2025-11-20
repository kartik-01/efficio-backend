import mongoose from "mongoose";

const dailySummarySchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, index: true }, // auth0Id
    date: { type: String, required: true, index: true }, // YYYY-MM-DD format
    
    totalMinutes: { type: Number, default: 0 },
    byCategory: [
      {
        categoryId: { type: String, required: true },
        minutes: { type: Number, required: true },
      },
    ],
    focus: {
      deepMinutes: { type: Number, default: 0 },
      otherMinutes: { type: Number, default: 0 },
    },
  },
  { timestamps: true }
);

// Unique index: one summary per user per day
dailySummarySchema.index({ userId: 1, date: 1 }, { unique: true });
dailySummarySchema.index({ userId: 1, date: -1 }); // For querying recent summaries

export default mongoose.model("DailySummary", dailySummarySchema);

