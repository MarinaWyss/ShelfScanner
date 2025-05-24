/**
 * Utility functions for book recommendation match quality
 */

/**
 * Get a descriptive match quality label based on the match score
 * @param matchScore Numeric score from OpenAI recommendations (0-100)
 * @returns User-friendly match quality label
 */
export function getMatchQualityLabel(matchScore: number | undefined): string {
  if (matchScore === undefined) return "Unknown match";
  
  // Match quality thresholds (these determine the labels shown to users)
  if (matchScore >= 85) return "Perfect match!";
  if (matchScore >= 70) return "Excellent match";
  if (matchScore >= 55) return "Great match";
  if (matchScore >= 40) return "Good match";
  if (matchScore >= 25) return "Fair match";
  return "Possible match";
}

/**
 * Get CSS class for match quality badge
 * @param matchScore Numeric score from OpenAI recommendations (0-100)
 * @returns CSS class for styling the match quality badge
 */
export function getMatchQualityClass(matchScore: number | undefined): string {
  if (matchScore === undefined) return "bg-gray-100 text-gray-800";
  
  if (matchScore >= 85) return "bg-purple-100 text-purple-800";
  if (matchScore >= 70) return "bg-indigo-100 text-indigo-800";
  if (matchScore >= 55) return "bg-blue-100 text-blue-800";
  if (matchScore >= 40) return "bg-green-100 text-green-800";
  if (matchScore >= 25) return "bg-yellow-100 text-yellow-800";
  return "bg-gray-100 text-gray-800";
}