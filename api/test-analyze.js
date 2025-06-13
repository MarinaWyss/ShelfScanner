export default function handler(req, res) {
  console.log('=== TEST ANALYZE API CALLED ===');
  console.log('Method:', req.method);
  console.log('URL:', req.url);
  
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  return res.status(200).json({
    message: 'Test analyze endpoint is working!',
    method: req.method,
    url: req.url,
    timestamp: new Date().toISOString()
  });
} 