import { defineConfig } from "drizzle-kit";
import 'dotenv/config';

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set. Check your environment variables.");
}

// Determine schema based on environment
const getSchema = () => {
  if (process.env.NODE_ENV === 'production') {
    return 'public';
  }
  return 'development';
};

const currentSchema = getSchema();

export default defineConfig({
  out: `./migrations/${currentSchema}`,
  schema: "./shared/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
  schemaFilter: [currentSchema],
  verbose: true,
  strict: true,
});
