import mongoose from 'mongoose';
import { config } from '@/config';
import { createLogger } from '@/utils/logger';

const logger = createLogger('Database');

interface ConnectionState {
  isConnected: boolean;
}

const connection: ConnectionState = {
  isConnected: false,
};

/**
 * Connect to MongoDB
 */
export async function connectToDatabase(): Promise<void> {
  if (connection.isConnected) {
    logger.debug('Using existing database connection');
    return;
  }

  if (mongoose.connections[0].readyState) {
    connection.isConnected = true;
    logger.debug('Using existing mongoose connection');
    return;
  }

  try {
    const db = await mongoose.connect(config.mongodb.uri, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });

    connection.isConnected = db.connections[0].readyState === 1;
    logger.info('Connected to MongoDB');
  } catch (error) {
    logger.error('Failed to connect to MongoDB', error);
    throw error;
  }
}

/**
 * Disconnect from MongoDB
 */
export async function disconnectFromDatabase(): Promise<void> {
  if (!connection.isConnected) {
    return;
  }

  try {
    await mongoose.disconnect();
    connection.isConnected = false;
    logger.info('Disconnected from MongoDB');
  } catch (error) {
    logger.error('Failed to disconnect from MongoDB', error);
    throw error;
  }
}

/**
 * Check database connection status
 */
export function isDatabaseConnected(): boolean {
  return connection.isConnected && mongoose.connections[0].readyState === 1;
}
