# Deprecation Plan

## Files Safe to Remove Immediately
1. **test-amazon-ratings.js** - Test file, not used in production
2. **test-amazon.js** - Test file, not used in production
3. **googleAuth.ts** - No direct imports found
4. **OpenAIDemo.tsx** - No imports found

## Files Requiring Code Changes Before Removal

### 1. AdMob.tsx
- Update `main.tsx` to remove import and initialization call:
```tsx
// Remove these lines
import { initializeAdMob } from "./components/ads/AdMob";
initializeAdMob();
```

### 2. amazon.ts
- Move `getEstimatedBookRating` function to a new utilities file (`server/utils/book-utils.ts`)
- Update imports in:
  - enhanced-books.ts
  - books.ts
  - book-cache-service.ts
  - routes.ts

### 3. demo-openai.ts
- Move `getOpenAIBookRating` and `getOpenAIBookSummary` to a more appropriately named file (like `server/openai-utils.ts`)
- Update the import in routes.ts

### 4. Auth-related files (AuthContext.tsx, Auth folder)
- Identify if Google login functionality is still needed
- If needed, create a simplified version of the auth context
- Update imports in components using these files

### 5. Auth-routes.ts
- This is actively used in routes.ts
- Should be kept unless auth functionality is being completely removed
- If removing, we'd need to remove the route registration in routes.ts

## Implementation Steps
1. Create any necessary utility files for functions being preserved
2. Update imports throughout the codebase
3. Remove unused files
4. Test functionality to ensure nothing was broken