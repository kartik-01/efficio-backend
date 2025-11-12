import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { connectDB } from "./config/db.js";
import { ensureUserIndexes } from "./utils/ensureIndexes.js";
import userRoutes from "./routes/userRoutes.js";
import taskRoutes from "./routes/taskRoutes.js";
import groupRoutes from "./routes/groupRoutes.js";
import activityRoutes from "./routes/activityRoutes.js";
import notificationRoutes from "./routes/notificationRoutes.js";
import { authenticate } from "./middleware/auth.js";
import timeRoutes from "./time-tracker/routes/timeRoutes.js";

dotenv.config();

// Connect to MongoDB and ensure indexes
connectDB()
  .then(async () => {
    // Ensure unique indexes exist after connection
    await ensureUserIndexes();
  })
  .catch(err => {
    console.error('MongoDB connection error:', err.message);
    console.log('Server will continue running, but database operations may fail');
  });

const app = express();

// CORS configuration - allow requests from frontend
const getAllowedOrigins = () => {
  // If FRONTEND_URL is set, use it (supports comma-separated URLs)
  if (process.env.FRONTEND_URL) {
    return process.env.FRONTEND_URL.split(',').map(url => url.trim());
  }
  // In development, allow all origins for convenience
  // In production, you should set FRONTEND_URL
  return process.env.NODE_ENV === 'production' ? [] : true;
};

const corsOptions = {
  origin: getAllowedOrigins(),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
  exposedHeaders: ['Content-Type', 'Authorization']
};

app.use(cors(corsOptions));
// Increase body size limit to handle base64 image uploads (10MB should be enough)
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging middleware for debugging
app.use((req, res, next) => {
  console.log(`${req.method} ${req.path} - Origin: ${req.headers.origin || 'no origin'}`);
  next();
});

// Base route
app.get("/", (req, res) => {
  res.send("Efficio backend is running 🚀");
});

// API routes
app.use("/api/users", userRoutes);
app.use("/api/tasks", taskRoutes);
app.use("/api/groups", groupRoutes);
app.use("/api/activities", activityRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/time", authenticate, timeRoutes);
const PORT = process.env.PORT || 4000; // Using port 4000
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
