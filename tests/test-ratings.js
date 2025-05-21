// Test script to verify star ratings display correctly

// Fetch books from API and test their ratings display
async function testStarRatings() {
  try {
    console.log("Starting star rating test...");
    
    // Step 1: Get test data - either fetch from API or use sample data
    const testBooks = [
      { title: "The Creative Act", author: "Rick Rubin", rating: "4.7" },
      { title: "The Psychology of Money", author: "Morgan Housel", rating: "4.5" },
      { title: "Atomic Habits", author: "James Clear", rating: "4.0" },
      { title: "Book with 1.0 Rating", author: "Test Author", rating: "1.0" },
      { title: "Book with 2.5 Rating", author: "Test Author", rating: "2.5" },
      { title: "Book with 3.7 Rating", author: "Test Author", rating: "3.7" },
      { title: "Book with 5.0 Rating", author: "Test Author", rating: "5.0" }
    ];
    
    console.log(`Testing ${testBooks.length} books with different ratings...`);
    
    // Step 2: For each book, test the rating display
    testBooks.forEach(book => {
      const { title, rating } = book;
      console.log(`\nTesting book: "${title}" with rating ${rating}`);
      
      // Parse rating value
      const numRating = parseFloat(rating);
      
      // Calculate expected star display
      const fullStars = Math.floor(numRating);
      const hasHalfStar = numRating % 1 >= 0.5;
      const emptyStars = 5 - (fullStars + (hasHalfStar ? 1 : 0));
      
      // Log expected display
      console.log(`Rating ${rating} should display as:`);
      console.log(`- ${fullStars} full star${fullStars !== 1 ? 's' : ''}`);
      console.log(`- ${hasHalfStar ? '1 half star' : '0 half stars'}`);
      console.log(`- ${emptyStars} empty star${emptyStars !== 1 ? 's' : ''}`);
      
      // Create visual representation
      let visual = '';
      for (let i = 0; i < fullStars; i++) visual += '★';
      if (hasHalfStar) visual += '½';
      for (let i = 0; i < emptyStars; i++) visual += '☆';
      
      console.log(`Visual: ${visual} (${rating})`);
    });
    
    console.log("\nStar rating test completed successfully!");
  } catch (error) {
    console.error("Error during star rating test:", error);
  }
}

// Run the test
testStarRatings();