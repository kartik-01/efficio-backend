import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { connectDB } from "./config/db.js";
import userRoutes from "./routes/userRoutes.js";
import taskRoutes from "./routes/taskRoutes.js";

dotenv.config();

// Connect to MongoDB (non-blocking, server will start even if connection fails initially)
connectDB().catch(err => {
  console.error('MongoDB connection error:', err.message);
  console.log('Server will continue running, but database operations may fail');
});

const app = express();

// CORS configuration - allow requests from frontend
// For development, allow all origins
const corsOptions = {
  origin: true, // Allow all origins in development
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
  exposedHeaders: ['Content-Type', 'Authorization']
};

app.use(cors(corsOptions));
app.use(express.json());

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

const PORT = process.env.PORT || 4000; // Using port 4000
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
