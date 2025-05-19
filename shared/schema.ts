import { pgTable, text, serial, integer, boolean, jsonb } from "drizzle-orm/pg-core";
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
  genres: text("genres").array().notNull(),
  readingFrequency: text("reading_frequency").notNull(),
  authors: text("authors").array(),
});

export const insertPreferenceSchema = createInsertSchema(preferences).pick({
  userId: true,
  genres: true,
  readingFrequency: true,
  authors: true,
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

// Book recommendations schema
export const recommendations = pgTable("recommendations", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  bookId: integer("book_id").notNull(),
  title: text("title").notNull(),
  author: text("author").notNull(),
  coverUrl: text("cover_url"),
  rating: text("rating"),
  summary: text("summary"),
});

export const insertRecommendationSchema = createInsertSchema(recommendations).pick({
  userId: true,
  bookId: true,
  title: true,
  author: true,
  coverUrl: true,
  rating: true,
  summary: true,
});

// Type definitions
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;

export type Preference = typeof preferences.$inferSelect;
export type InsertPreference = z.infer<typeof insertPreferenceSchema>;

export type Book = typeof books.$inferSelect;
export type InsertBook = z.infer<typeof insertBookSchema>;

export type Recommendation = typeof recommendations.$inferSelect;
export type InsertRecommendation = z.infer<typeof insertRecommendationSchema>;
