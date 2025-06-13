CREATE SCHEMA "development";
--> statement-breakpoint
CREATE TABLE "development"."book_cache" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"author" text NOT NULL,
	"isbn" varchar(30),
	"book_id" text NOT NULL,
	"cover_url" text,
	"rating" varchar(10),
	"summary" text,
	"source" varchar(20) NOT NULL,
	"metadata" jsonb,
	"cached_at" timestamp DEFAULT now(),
	"expires_at" timestamp,
	CONSTRAINT "book_cache_isbn_unique" UNIQUE("isbn"),
	CONSTRAINT "book_cache_book_id_unique" UNIQUE("book_id")
);
--> statement-breakpoint
CREATE TABLE "development"."preferences" (
	"id" serial PRIMARY KEY NOT NULL,
	"device_id" text NOT NULL,
	"genres" text[] NOT NULL,
	"authors" text[],
	"goodreads_data" jsonb
);
--> statement-breakpoint
CREATE TABLE "development"."saved_books" (
	"id" serial PRIMARY KEY NOT NULL,
	"device_id" text NOT NULL,
	"book_cache_id" integer,
	"title" text NOT NULL,
	"author" text NOT NULL,
	"cover_url" text,
	"rating" text,
	"summary" text,
	"saved_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "development"."users" (
	"id" serial PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"password" text NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
ALTER TABLE "development"."saved_books" ADD CONSTRAINT "saved_books_book_cache_id_book_cache_id_fk" FOREIGN KEY ("book_cache_id") REFERENCES "development"."book_cache"("id") ON DELETE no action ON UPDATE no action;