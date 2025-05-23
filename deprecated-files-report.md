# Deprecated Files Report

## Files to Deprecate

1. **server/amazon.ts**
   - This file contains Amazon book rating functions that aren't directly used in the app anymore
   - The app has moved to using OpenAI for book ratings and descriptions
   - While `getEstimatedBookRating` is still referenced in some files, this functionality could be moved to a utility file

2. **server/enhanced-books.ts**
   - This appears to be a duplicate or older version of functionality now handled by `enhanced-book-api.ts`
   - Contains very similar code to `books.ts` but with slight modifications

3. **server/admin-routes.ts**
   - Likely replaced by `admin-monitoring.ts` as they have overlapping functionality
   - Both files contain similar routes and authentication logic

4. **server/vision.ts**
   - While still used as a fallback in `openai-vision.ts`, this Google Vision integration appears to be secondary
   - The application primarily uses OpenAI's vision capabilities now

5. **server/openai-test.ts**
   - Based on the name and file size, this appears to be a testing file that isn't needed in production

## Recommendation for Deprecation Process

1. Move any essential functions from deprecated files to appropriate utility files
2. Add proper imports to maintain functionality where needed
3. Create "deprecated" comments in files before removing them entirely
4. Update import statements across the codebase
5. Remove the deprecated files after thorough testing

## Implementation Plan

For each file:
1. Create a backup
2. Move essential functions to appropriate locations
3. Update import statements throughout the codebase
4. Test the application thoroughly
5. Remove deprecated files