import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useLocation } from 'wouter';
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardFooter, 
  CardHeader, 
  CardTitle 
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertCircle, Clock, AlertTriangle, CheckCircle, Info, Activity } from "lucide-react";
// Import the LoginForm component 
import LoginForm from '../../components/admin/LoginForm';


interface ApiStats {
  windowUsage: number;
  windowSeconds: number;
  dailyUsage: number;
  dailyLimit: number;
  withinLimits: boolean;
}

interface StatsResponse {
  timestamp: string;
  stats: Record<string, ApiStats>;
  config: {
    openaiEnabled: boolean;
    openaiConfigured: boolean;
    googleVisionConfigured: boolean;
  };
}

/**
 * Admin Dashboard Page
 * Secure page for monitoring system status and API usage
 */
export default function AdminPage() {
  // Auth state
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const { toast } = useToast();

  // Check if user is authenticated
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const response = await fetch('/api/admin/check-auth');
        if (response.ok) {
          setIsAuthenticated(true);
        }
      } catch (error) {
        console.error('Error checking authentication:', error);
      }
      setAuthChecked(true);
    };
    
    checkAuth();
  }, []);

  // Query for API stats
  const { data, error, isLoading, refetch } = useQuery<StatsResponse>({
    queryKey: ['/api/admin/stats'],
    enabled: isAuthenticated,
    refetchInterval: 60000, // Refetch every minute
  });

  const handleLogin = (success: boolean) => {
    if (success) {
      setIsAuthenticated(true);
      toast({
        title: "Login successful",
        description: "Welcome to the admin dashboard",
      });
    }
  };

  // Handle refresh button click
  const handleRefresh = () => {
    refetch();
    toast({
      title: "Refreshed",
      description: "Dashboard data has been updated",
    });
  };

  // Show loading state while authentication is checked
  if (!authChecked) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Loading Admin Dashboard</h1>
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary mx-auto"></div>
        </div>
      </div>
    );
  }

  // Show login form if not authenticated
  if (!isAuthenticated) {
    return (
      <div className="flex justify-center items-center min-h-screen bg-gray-50">
        <Card className="w-full max-w-md mx-4">
          <CardHeader>
            <CardTitle>Admin Login</CardTitle>
            <CardDescription>
              Please log in to access the admin dashboard
            </CardDescription>
          </CardHeader>
          <CardContent>
            <LoginForm onLoginSuccess={handleLogin} />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Admin Dashboard</h1>
        <div className="flex gap-2">
          <Link href="/admin/stats">
            <Button variant="default" className="flex items-center gap-2">
              <Activity className="h-4 w-4" /> View Detailed Stats
            </Button>
          </Link>
          <Button onClick={handleRefresh} variant="outline" className="flex items-center gap-2">
            <Clock className="h-4 w-4" /> Refresh
          </Button>
        </div>
      </div>

      {error && (
        <Alert variant="destructive" className="mb-6">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>
            Failed to load dashboard data. Please try refreshing.
          </AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="system">
        <TabsList className="mb-6">
          <TabsTrigger value="system">System Status</TabsTrigger>
          <TabsTrigger value="api">API Usage</TabsTrigger>
          <TabsTrigger value="logs">Logs</TabsTrigger>
        </TabsList>

        {/* System Status Tab */}
        <TabsContent value="system">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <SystemStatusCard 
              title="OpenAI API" 
              status={data?.config.openaiConfigured ? "Configured" : "Not Configured"} 
              enabled={data?.config.openaiEnabled}
            />
            <SystemStatusCard 
              title="Google Vision API" 
              status={data?.config.googleVisionConfigured ? "Configured" : "Not Configured"} 
              enabled={data?.config.googleVisionConfigured}
            />
            <SystemStatusCard 
              title="SendGrid Email" 
              status="Not Available in Frontend"
              enabled={false}
            />
          </div>
        </TabsContent>

        {/* API Usage Tab */}
        <TabsContent value="api">
          <div className="grid grid-cols-1 gap-6">
            {isLoading ? (
              <div className="text-center py-12">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary mx-auto mb-4"></div>
                <p>Loading API statistics...</p>
              </div>
            ) : (
              <>
                {data && Object.entries(data.stats).map(([apiName, stats]) => (
                  <ApiUsageCard 
                    key={apiName}
                    apiName={apiName}
                    stats={stats}
                  />
                ))}
                
                <Card className="mt-6">
                  <CardHeader>
                    <CardTitle>Last Updated</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p>{data?.timestamp ? new Date(data.timestamp).toLocaleString() : 'Unknown'}</p>
                  </CardContent>
                  <CardFooter>
                    <Button onClick={handleRefresh} variant="outline">Refresh Data</Button>
                  </CardFooter>
                </Card>
              </>
            )}
          </div>
        </TabsContent>

        {/* Logs Tab */}
        <TabsContent value="logs">
          <Card>
            <CardHeader>
              <CardTitle>Application Logs</CardTitle>
              <CardDescription>
                Recent application logs and events
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="bg-gray-50 dark:bg-gray-900 p-4 rounded-md min-h-[300px] max-h-[600px] overflow-y-auto font-mono text-sm">
                <LogViewer />
              </div>
            </CardContent>
            <CardFooter>
              <Button variant="outline" onClick={() => fetch('/api/admin/logs/refresh')}>
                Refresh Logs
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

/**
 * System Status Card Component
 */
function SystemStatusCard({ 
  title, 
  status, 
  enabled 
}: { 
  title: string; 
  status: string | undefined | boolean; 
  enabled: boolean | undefined;
}) {
  const statusText = typeof status === 'string' ? status : (status ? 'Enabled' : 'Disabled');
  const isActive = enabled !== false;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-2">
          <div className={`h-3 w-3 rounded-full ${isActive ? 'bg-green-500' : 'bg-red-500'}`}></div>
          <p>{statusText}</p>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * API Usage Card Component
 */
function ApiUsageCard({ 
  apiName, 
  stats
}: { 
  apiName: string; 
  stats: ApiStats;
}) {
  // Calculate usage percentages
  const windowUsagePercent = Math.min(100, (stats.windowUsage / (stats.windowSeconds || 1)) * 100);
  const dailyUsagePercent = Math.min(100, (stats.dailyUsage / stats.dailyLimit) * 100);
  
  // Format API name for display
  const formattedApiName = apiName
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
    
  // Determine status color based on usage
  const getStatusColor = (percent: number) => {
    if (percent >= 90) return 'bg-red-500';
    if (percent >= 80) return 'bg-yellow-500';
    if (percent >= 50) return 'bg-blue-500';
    return 'bg-green-500';
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{formattedApiName} API Usage</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div>
            <div className="flex justify-between mb-1">
              <p className="text-sm font-medium">Daily Usage</p>
              <p className="text-sm text-gray-500">{stats.dailyUsage}/{stats.dailyLimit}</p>
            </div>
            <Progress value={dailyUsagePercent} className="h-2" />
            {dailyUsagePercent >= 80 && (
              <p className="text-sm text-yellow-500 mt-1">
                Warning: Approaching daily limit
              </p>
            )}
          </div>
          
          <div>
            <div className="flex justify-between mb-1">
              <p className="text-sm font-medium">Current Window Usage</p>
              <p className="text-sm text-gray-500">{stats.windowUsage} reqs/{stats.windowSeconds}s</p>
            </div>
            <div className="h-2 w-full bg-gray-200 rounded-full overflow-hidden">
              <div 
                className={`h-full ${getStatusColor(windowUsagePercent)}`}
                style={{ width: `${windowUsagePercent}%` }}
              ></div>
            </div>
          </div>
        </div>
      </CardContent>
      <CardFooter>
        <div className="flex items-center text-sm">
          <span className={`h-2 w-2 rounded-full ${stats.withinLimits ? 'bg-green-500' : 'bg-red-500'} mr-2`}></span>
          <span>{stats.withinLimits ? 'Within rate limits' : 'Rate limit exceeded'}</span>
        </div>
      </CardFooter>
    </Card>
  );
}

/**
 * Log Viewer Component
 */
function LogViewer() {
  const [logs, setLogs] = useState<string[]>([]);

  useEffect(() => {
    const fetchLogs = async () => {
      try {
        const response = await fetch('/api/admin/logs');
        if (response.ok) {
          const data = await response.json();
          setLogs(data.logs || []);
        }
      } catch (error) {
        console.error('Error fetching logs:', error);
      }
    };

    fetchLogs();
    
    // Set up a refresh interval
    const interval = setInterval(fetchLogs, 30000);
    return () => clearInterval(interval);
  }, []);

  if (logs.length === 0) {
    return <p className="text-gray-500">No logs available</p>;
  }

  return (
    <div className="space-y-1">
      {logs.map((log, index) => (
        <div 
          key={index} 
          className={`py-1 border-b border-gray-200 dark:border-gray-700 ${
            log.includes('ERROR') ? 'text-red-500' : 
            log.includes('WARN') ? 'text-yellow-500' : 
            log.includes('INFO') ? 'text-blue-500' : ''
          }`}
        >
          {log}
        </div>
      ))}
    </div>
  );
}