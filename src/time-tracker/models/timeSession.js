import mongoose from "mongoose";

const timeSessionSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, index: true }, // auth0Id
    taskId: { type: mongoose.Schema.Types.ObjectId, ref: "Task", default: null },
    taskTitle: { type: String, default: null },   // denormalized for UX/NLP
    groupTag: { type: String, default: "@personal" },

    categoryId: {
      type: String,
      required: true,            // one of fixed categories
      enum: ["work","learning","admin","health","personal","rest"],
      index: true,
    },

    startTime: { type: Date, required: true, index: true },
    endTime:   { type: Date, default: null, index: true }, // null => running
    source:    { type: String, enum: ["timer","manual"], required: true },
    notes:     { type: String, default: "" },
  },
  { timestamps: true }
);

// Helpful compound indexes
timeSessionSchema.index({ userId: 1, endTime: 1 }); // find running (endTime:null)
timeSessionSchema.index({ userId: 1, startTime: 1 });
timeSessionSchema.index({ userId: 1, categoryId: 1, startTime: 1 });
timeSessionSchema.index({ userId: 1, taskId: 1, startTime: 1 });

export default mongoose.model("TimeSession", timeSessionSchema);