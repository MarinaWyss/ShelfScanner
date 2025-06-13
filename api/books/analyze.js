export default function handler(req, res) {
  console.log('=== BOOKS ANALYZE API CALLED (ES MODULE) ===');
  console.log('Method:', req.method);
  console.log('URL:', req.url);
  console.log('Content-Type:', req.headers['content-type']);
  
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    console.log('Handling OPTIONS request');
    return res.status(200).end();
  }
  
  if (req.method !== 'POST') {
    console.log('Invalid method:', req.method);
    return res.status(405).json({ message: 'Method not allowed' });
  }
  
  console.log('Starting POST request processing...');
  
  // For now, just return a simple response to test if the endpoint is working
  return res.status(200).json({
    message: 'Books analyze endpoint is working! (This is a test response)',
    method: req.method,
    contentType: req.headers['content-type'],
    timestamp: new Date().toISOString()
  });
} 