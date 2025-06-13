import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

interface ApiResponse {
  status: number;
  data: any;
  error?: string;
}

export default function Debug() {
  const [healthCheck, setHealthCheck] = useState<ApiResponse | null>(null);
  const [preferencesTest, setPreferencesTest] = useState<ApiResponse | null>(null);
  const [savedBooksTest, setSavedBooksTest] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState<string | null>(null);

  const testEndpoint = async (
    url: string,
    method = 'GET',
    body?: any,
    setter?: (response: ApiResponse) => void
  ): Promise<ApiResponse> => {
    try {
      const options: RequestInit = {
        method,
        credentials: 'include',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        }
      };

      if (body && method !== 'GET') {
        options.body = JSON.stringify(body);
      }

      const response = await fetch(url, options);
      const data = await response.json();
      
      const result = {
        status: response.status,
        data,
        error: response.ok ? undefined : `HTTP ${response.status}`
      };

      if (setter) {setter(result);}
      return result;
    } catch (error) {
      const result = {
        status: 0,
        data: null,
        error: error instanceof Error ? error.message : String(error)
      };
      
      if (setter) {setter(result);}
      return result;
    }
  };

  const runHealthCheck = async () => {
    setLoading('health');
    await testEndpoint('/api/health-check', 'GET', undefined, setHealthCheck);
    setLoading(null);
  };

  const testPreferences = async () => {
    setLoading('preferences');
    // First try to get preferences
    const getResult = await testEndpoint('/api/preferences', 'GET', undefined, setPreferencesTest);
    
    // If we get a 404, try to create some test preferences
    if (getResult.status === 404) {
      const testPrefs = {
        genres: ['Fiction', 'Science Fiction'],
        authors: ['Test Author'],
        goodreadsData: null
      };
      
      await testEndpoint('/api/preferences', 'POST', testPrefs, setPreferencesTest);
    }
    setLoading(null);
  };

  const testSavedBooks = async () => {
    setLoading('savedBooks');
    await testEndpoint('/api/saved-books', 'GET', undefined, setSavedBooksTest);
    setLoading(null);
  };

  const renderResponse = (response: ApiResponse | null, title: string) => (
    <Card className="p-4 mb-4">
      <h3 className="text-lg font-semibold mb-2">{title}</h3>
      {response ? (
        <div>
          <div className={`mb-2 p-2 rounded ${response.status >= 200 && response.status < 300 ? 'bg-green-100' : 'bg-red-100'}`}>
            Status: {response.status} {response.error && `- ${response.error}`}
          </div>
          <pre className="bg-gray-100 p-2 rounded text-sm overflow-auto max-h-64">
            {JSON.stringify(response.data, null, 2)}
          </pre>
        </div>
      ) : (
        <div className="text-gray-500">Not tested yet</div>
      )}
    </Card>
  );

  return (
    <div className="bg-white min-h-screen">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">API Debug Page</h1>
        
        <div className="mb-6 space-x-4">
          <Button 
            onClick={runHealthCheck}
            disabled={loading === 'health'}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {loading === 'health' ? 'Testing...' : 'Test Health Check'}
          </Button>
          
          <Button 
            onClick={testPreferences}
            disabled={loading === 'preferences'}
            className="bg-green-600 hover:bg-green-700"
          >
            {loading === 'preferences' ? 'Testing...' : 'Test Preferences API'}
          </Button>
          
          <Button 
            onClick={testSavedBooks}
            disabled={loading === 'savedBooks'}
            className="bg-purple-600 hover:bg-purple-700"
          >
            {loading === 'savedBooks' ? 'Testing...' : 'Test Saved Books API'}
          </Button>
        </div>

        <div className="space-y-4">
          {renderResponse(healthCheck, 'Health Check (/api/health-check)')}
          {renderResponse(preferencesTest, 'Preferences API (/api/preferences)')}
          {renderResponse(savedBooksTest, 'Saved Books API (/api/saved-books)')}
        </div>

        <Card className="p-4 mt-6">
          <h3 className="text-lg font-semibold mb-2">Environment Info</h3>
          <div className="text-sm space-y-1">
            <div>URL: {window.location.href}</div>
            <div>User Agent: {navigator.userAgent}</div>
            <div>Cookies: {document.cookie || 'None'}</div>
          </div>
        </Card>
      </div>
    </div>
  );
} 