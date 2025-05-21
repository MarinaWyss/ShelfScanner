// Test script to verify Amazon ratings API functionality
require('dotenv').config();
const axios = require('axios');

async function testAmazonRatings() {
  try {
    console.log("Testing Amazon book ratings API with Rainforest...");
    
    // List of popular books to test
    const testBooks = [
      { title: "Atomic Habits", author: "James Clear" },
      { title: "The Alchemist", author: "Paulo Coelho" },
      { title: "1984", author: "George Orwell" },
      { title: "To Kill a Mockingbird", author: "Harper Lee" },
      { title: "The Psychology of Money", author: "Morgan Housel" }
    ];
    
    console.log(`Testing ${testBooks.length} popular books...\n`);
    
    for (const book of testBooks) {
      const { title, author } = book;
      
      // Create the search query
      const searchQuery = `${title} ${author}`;
      const encodedQuery = encodeURIComponent(searchQuery);
      
      // Check if Rainforest API key is available
      const apiKey = process.env.RAINFOREST_API_KEY;
      if (!apiKey) {
        console.error("Error: Rainforest API key not found in environment variables");
        process.exit(1);
      }
      
      console.log(`Searching Amazon for: "${title}" by ${author}...`);
      
      // Search for the book
      const searchUrl = `https://api.rainforestapi.com/request?api_key=${apiKey}&type=search&amazon_domain=amazon.com&search_term=${encodedQuery}`;
      
      const searchResponse = await axios.get(searchUrl, {
        timeout: 10000 // 10 second timeout
      });
      
      // Check if we got search results
      if (searchResponse.data.search_results && searchResponse.data.search_results.length > 0) {
        // Get the ASIN of the first product (most relevant match)
        const firstResult = searchResponse.data.search_results[0];
        const asin = firstResult.asin;
        
        if (!asin) {
          console.log(`No ASIN found for "${title}" by ${author}`);
          continue;
        }
        
        console.log(`Found ASIN: ${asin}, fetching product details...`);
        
        // Now fetch the product details including ratings
        const productUrl = `https://api.rainforestapi.com/request?api_key=${apiKey}&type=product&amazon_domain=amazon.com&asin=${asin}`;
        
        const productResponse = await axios.get(productUrl, {
          timeout: 10000
        });
        
        // Extract the rating
        if (productResponse.data && 
            productResponse.data.product && 
            productResponse.data.product.rating) {
          const rating = productResponse.data.product.rating;
          const totalRatings = productResponse.data.product.ratings_total || 'unknown';
          
          console.log(`SUCCESS! Amazon rating for "${title}" by ${author}: ${rating} (${totalRatings} reviews)\n`);
        } else {
          console.log(`No rating found for "${title}" by ${author} in the product data\n`);
        }
      } else {
        console.log(`No search results found for "${title}" by ${author}\n`);
      }
    }
    
    console.log("Amazon ratings test completed!");
  } catch (error) {
    console.error("Error testing Amazon ratings:", error.message);
    if (error.response) {
      console.error("API Response:", error.response.data);
    }
  }
}

// Run the test
testAmazonRatings();