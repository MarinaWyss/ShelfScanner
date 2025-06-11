import 'dotenv/config';
import express from "express";
import cookieParser from "cookie-parser";
import { registerRoutes } from "../server/routes";
import { ensureDeviceId } from "../server/middleware/deviceId";

const app = express();

// Increase payload limit to 50MB for handling large CSV files
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: false, limit: '50mb' }));
app.use(cookieParser());
app.use(ensureDeviceId);

// Register API routes
registerRoutes(app);

export default app; 