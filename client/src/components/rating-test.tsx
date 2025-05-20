import React from "react";
import StarRating from "@/components/ui/star-rating";
import { Card } from "@/components/ui/card";

export default function RatingTest() {
  // Test cases for star ratings
  const testRatings = [
    { title: "1.0 Star Rating", rating: "1.0" },
    { title: "2.5 Star Rating", rating: "2.5" },
    { title: "3.0 Star Rating", rating: "3.0" },
    { title: "3.7 Star Rating", rating: "3.7" },
    { title: "4.0 Star Rating", rating: "4.0" },
    { title: "4.7 Star Rating", rating: "4.7" },
    { title: "5.0 Star Rating", rating: "5.0" }
  ];

  return (
    <div className="bg-black min-h-screen p-8">
      <div className="container mx-auto">
        <h1 className="text-2xl font-bold text-white mb-6">Star Rating Component Test</h1>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {testRatings.map((item, index) => (
            <Card key={index} className="overflow-hidden bg-slate-900 border border-slate-800 shadow-sm p-5">
              <h2 className="font-semibold text-white mb-3">{item.title}</h2>
              <StarRating rating={item.rating} />
              <p className="text-slate-400 text-sm mt-3">
                This shows how {item.rating} stars are displayed visually
              </p>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}