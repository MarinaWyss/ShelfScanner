import React from "react";
import { Star, StarHalf } from "lucide-react";

interface StarRatingProps {
  rating: string | number;
  showNumeric?: boolean;
  className?: string;
  starSize?: number;
}

export default function StarRating({ 
  rating, 
  showNumeric = true, 
  className = "", 
  starSize = 4 
}: StarRatingProps) {
  // Convert rating to number if it's a string
  const numRating = typeof rating === "string" ? parseFloat(rating) : rating;
  
  // Calculate full and half stars
  const fullStars = Math.floor(numRating);
  const hasHalfStar = numRating % 1 >= 0.5;
  const emptyStars = 5 - (fullStars + (hasHalfStar ? 1 : 0));
  
  return (
    <div className={`flex items-center ${className}`}>
      <div className="flex text-yellow-400">
        {/* Full stars */}
        {Array.from({ length: fullStars }).map((_, i) => (
          <Star key={`full-${i}`} className={`h-${starSize} w-${starSize} fill-current`} />
        ))}
        
        {/* Half star if needed */}
        {hasHalfStar && (
          <StarHalf key="half" className={`h-${starSize} w-${starSize} fill-current`} />
        )}
        
        {/* Empty stars */}
        {Array.from({ length: emptyStars }).map((_, i) => (
          <Star key={`empty-${i}`} className={`h-${starSize} w-${starSize} text-gray-700`} />
        ))}
      </div>
      
      {showNumeric && (
        <span className="text-sm ml-2 text-slate-400 whitespace-nowrap">
          {numRating.toFixed(1)}
        </span>
      )}
    </div>
  );
}