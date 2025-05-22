import { pgTable, text, serial, integer, boolean, jsonb, timestamp, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// User schema
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

// Book preferences schema
export const preferences = pgTable("preferences", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  deviceId: text("device_id"),
  genres: text("genres").array().notNull(),
  authors: text("authors").array(),
  goodreadsData: jsonb("goodreads_data"),
});

export const insertPreferenceSchema = createInsertSchema(preferences).pick({
  userId: true,
  deviceId: true,
  genres: true,
  authors: true,
  goodreadsData: true,
});

// Scanned books schema
export const books = pgTable("books", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  title: text("title").notNull(),
  author: text("author"),
  isbn: text("isbn"),
  coverUrl: text("cover_url"),
  metadata: jsonb("metadata"),
});

export const insertBookSchema = createInsertSchema(books).pick({
  userId: true,
  title: true,
  author: true,
  isbn: true,
  coverUrl: true,
  metadata: true,
});

// NOTE: Recommendations are now generated on-demand and not stored in the database
// We've removed the recommendations table in favor of an ephemeral approach

// Book cache schema for storing book metadata to reduce external API calls
export const bookCache = pgTable("book_cache", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  author: text("author").notNull(),
  isbn: varchar("isbn", { length: 30 }),
  coverUrl: text("cover_url"),
  rating: varchar("rating", { length: 10 }),
  summary: text("summary"),
  source: varchar("source", { length: 20 }).notNull(), // 'google', 'amazon', 'openai'
  metadata: jsonb("metadata"),
  cachedAt: timestamp("cached_at").defaultNow(),
  expiresAt: timestamp("expires_at"), // Cache expiration time
});

export const insertBookCacheSchema = createInsertSchema(bookCache).pick({
  title: true,
  author: true,
  isbn: true,
  coverUrl: true,
  rating: true,
  summary: true,
  source: true,
  metadata: true,
  expiresAt: true,
});

export type BookCache = typeof bookCache.$inferSelect;
export type InsertBookCache = z.infer<typeof insertBookCacheSchema>;
