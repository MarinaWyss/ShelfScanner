/**
 * Utility functions for book recommendation match quality
 */

/**
 * Get a descriptive match quality label based on the match score
 * @param matchScore Numeric score from OpenAI recommendations (0-100)
 * @returns User-friendly match quality label or empty string if below threshold
 */
export function getMatchQualityLabel(matchScore: number | undefined): string {
  if (matchScore === undefined) return "";
  
  // More conservative match quality thresholds
  if (matchScore >= 90) return "Great match";
  if (matchScore >= 76) return "Good match";
  if (matchScore >= 60) return "Fair match";
  return ""; // Show nothing for scores below 60
}

/**
 * Get CSS class for match quality badge
 * @param matchScore Numeric score from OpenAI recommendations (0-100)
 * @returns CSS class for styling the match quality badge or empty string if below threshold
 */
export function getMatchQualityClass(matchScore: number | undefined): string {
  if (matchScore === undefined) return "";
  
  // Updated to match the new conservative thresholds
  if (matchScore >= 90) return "bg-green-100 text-green-800";
  if (matchScore >= 76) return "bg-blue-100 text-blue-800";
  if (matchScore >= 60) return "bg-yellow-100 text-yellow-800";
  return ""; // No badge for scores below 60
}