// Simple test script to verify rate limiter functionality
const axios = require('axios');

async function testRateLimits() {
  console.log('Testing API rate limiter functionality...\n');

  // Test 1: Get current API statistics
  try {
    console.log('Test 1: Getting API statistics');
    const statsResponse = await axios.get('http://localhost:5000/api/stats');
    console.log('API Stats:', JSON.stringify(statsResponse.data, null, 2));
    console.log('');
  } catch (error) {
    console.error('Error getting API stats:', error.message);
  }

  // Test 2: Simulate multiple OpenAI API calls to trigger rate limits
  try {
    console.log('Test 2: Simulating multiple API calls to test rate limiter');
    console.log('Making 5 calls to analyze endpoint to test rate limiting...');
    
    // Make multiple requests to the OpenAI endpoint to test rate limiting
    for (let i = 0; i < 5; i++) {
      try {
        // Using the books/analyze endpoint that uses OpenAI Vision
        // We're not sending actual image data since we just want to test the rate limiter
        console.log(`Making request ${i + 1}...`);
        await axios.post('http://localhost:5000/api/test-rate-limit/openai', { 
          apiName: 'openai',
          simulate: true
        });
      } catch (error) {
        // If we hit a rate limit, that's actually what we want to test
        if (error.response && error.response.status === 429) {
          console.log(`✓ Request ${i + 1} was correctly rate limited!`);
        } else {
          console.error(`Error making request ${i + 1}:`, error.message);
        }
      }
    }
    
    console.log('');
  } catch (error) {
    console.error('Error in test 2:', error.message);
  }

  // Test 3: Get updated API statistics after the test
  try {
    console.log('Test 3: Getting updated API statistics');
    const statsResponse = await axios.get('http://localhost:5000/api/stats');
    console.log('Updated API Stats:', JSON.stringify(statsResponse.data, null, 2));
  } catch (error) {
    console.error('Error getting updated API stats:', error.message);
  }
}

testRateLimits();