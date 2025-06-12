// Simple test API function for Vercel
module.exports = (req, res) => {
  res.status(200).json({
    message: 'Hello from Vercel serverless function!',
    success: true
  });
}; 