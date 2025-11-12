import mongoose from "mongoose";

const timePlanSchema = new mongoose.Schema(
  {
    userId:    { type: String, required: true, index: true }, // auth0Id
    taskId:    { type: mongoose.Schema.Types.ObjectId, ref: "Task", default: null },
    taskTitle: { type: String, default: null },
    groupTag:  { type: String, default: "@personal" },
    categoryId:{ type: String, required: true, enum: ["work","learning","admin","health","personal","rest"] },

    // Planned window
    startTime: { type: Date, required: true, index: true },
    endTime:   { type: Date, required: true, index: true },

    notes:     { type: String, default: "" },
    status:    { type: String, enum: ["scheduled","in_progress","done","canceled"], default: "scheduled" },

    // Link to actual session created from this plan (optional)
    sessionId: { type: mongoose.Schema.Types.ObjectId, ref: "TimeSession", default: null },
  },
  { timestamps: true }
);

timePlanSchema.index({ userId: 1, startTime: 1 });
timePlanSchema.index({ userId: 1, status: 1, startTime: 1 });

export default mongoose.model("TimePlan", timePlanSchema);