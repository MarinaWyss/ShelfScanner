import pkg from 'pg';
const { Pool } = pkg;
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from "../shared/schema.js";

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// Serverless-friendly connection pool configuration
export const pool = new Pool({ 
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  // Reduced pool size for serverless functions
  max: process.env.NODE_ENV === 'production' ? 1 : 20,
  // Shorter timeouts for serverless
  idleTimeoutMillis: process.env.NODE_ENV === 'production' ? 1000 : 30000,
  connectionTimeoutMillis: process.env.NODE_ENV === 'production' ? 5000 : 2000,
  // Allow idle clients to be closed more aggressively
  allowExitOnIdle: process.env.NODE_ENV === 'production',
});

// Add error handling for the pool
pool.on('error', (err) => {
  console.error('Database pool error:', err);
});

export const db = drizzle({ client: pool, schema });

// Helper function to test database connectivity
export async function testDatabaseConnection(): Promise<boolean> {
  try {
    const client = await pool.connect();
    const result = await client.query('SELECT 1 as test');
    client.release();
    console.log('Database connection test successful');
    return result.rows[0].test === 1;
  } catch (error) {
    console.error('Database connection test failed:', error);
    return false;
  }
}
