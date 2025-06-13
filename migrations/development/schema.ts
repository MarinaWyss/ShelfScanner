import { pgTable, pgSchema, unique, serial, text, varchar, jsonb, timestamp, foreignKey, integer } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

export const development = pgSchema("development");


export const bookCacheInDevelopment = development.table("book_cache", {
	id: serial().primaryKey().notNull(),
	title: text().notNull(),
	author: text().notNull(),
	isbn: varchar({ length: 30 }),
	bookId: text("book_id").notNull(),
	coverUrl: text("cover_url"),
	rating: varchar({ length: 10 }),
	summary: text(),
	source: varchar({ length: 20 }).notNull(),
	metadata: jsonb(),
	cachedAt: timestamp("cached_at", { mode: 'string' }).defaultNow(),
	expiresAt: timestamp("expires_at", { mode: 'string' }),
}, (table) => [
	unique("book_cache_isbn_unique").on(table.isbn),
	unique("book_cache_book_id_unique").on(table.bookId),
]);

export const preferencesInDevelopment = development.table("preferences", {
	id: serial().primaryKey().notNull(),
	deviceId: text("device_id").notNull(),
	genres: text().array().notNull(),
	authors: text().array(),
	goodreadsData: jsonb("goodreads_data"),
});

export const savedBooksInDevelopment = development.table("saved_books", {
	id: serial().primaryKey().notNull(),
	deviceId: text("device_id").notNull(),
	bookCacheId: integer("book_cache_id"),
	title: text().notNull(),
	author: text().notNull(),
	coverUrl: text("cover_url"),
	rating: text(),
	summary: text(),
	savedAt: timestamp("saved_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	foreignKey({
			columns: [table.bookCacheId],
			foreignColumns: [bookCacheInDevelopment.id],
			name: "saved_books_book_cache_id_book_cache_id_fk"
		}),
]);

export const usersInDevelopment = development.table("users", {
	id: serial().primaryKey().notNull(),
	username: text().notNull(),
	password: text().notNull(),
}, (table) => [
	unique("users_username_unique").on(table.username),
]);
