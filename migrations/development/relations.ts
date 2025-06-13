import { relations } from "drizzle-orm/relations";
import { bookCacheInDevelopment, savedBooksInDevelopment } from "./schema";

export const savedBooksInDevelopmentRelations = relations(savedBooksInDevelopment, ({one}) => ({
	bookCacheInDevelopment: one(bookCacheInDevelopment, {
		fields: [savedBooksInDevelopment.bookCacheId],
		references: [bookCacheInDevelopment.id]
	}),
}));

export const bookCacheInDevelopmentRelations = relations(bookCacheInDevelopment, ({many}) => ({
	savedBooksInDevelopments: many(savedBooksInDevelopment),
}));