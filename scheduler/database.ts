import mongoose from "mongoose";
import { logger } from "./logger";

let isConnected = false;

export async function connectDb(): Promise<typeof mongoose> {
  if (isConnected) {
    return mongoose;
  }

  const MONGODB_URI = process.env.MONGODB_URI;
  if (!MONGODB_URI) {
    logger.error("database", "MONGODB_URI is not set. Set it in .env or the environment before starting the scheduler.");
    throw new Error("MONGODB_URI is not set");
  }

  const conn = await mongoose.connect(MONGODB_URI, {
    bufferCommands: false,
  });

  isConnected = true;
  logger.info("database", "Connected to MongoDB");
  return conn;
}

export async function closeDb(): Promise<void> {
  if (isConnected) {
    await mongoose.disconnect();
    isConnected = false;
    logger.info("database", "Disconnected from MongoDB");
  }
}

export { mongoose };
