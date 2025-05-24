import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'wouter';
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardHeader, 
  CardTitle 
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { 
  AlertCircle, 
  ArrowLeft, 
  Clock, 
  AlertTriangle, 
  CheckCircle, 
  Server, 
  Activity
} from "lucide-react";

interface ApiStats {
  windowUsage: number;
  windowSeconds: number;
  dailyUsage: number;
  dailyLimit: number;
  withinLimits: boolean;
}

interface ApiMonitoring {
  openai: {
    configured: boolean;
    status: string;
    failureCount: number;
    affectedUsers: number;
    lastFailure: string | null;
    isCritical: boolean;
    usageToday: number;
    dailyLimit: number;
  };
  failures: Record<string, any>;
}

interface StatsResponse {
  timestamp: string;
  health: Record<string, any>;
  apiMonitoring: ApiMonitoring;
  [key: string]: any;
}

/**
 * Admin Stats Page Component
 * Displayed within the admin dashboard to show API monitoring details
 */
export default function AdminStatsPage() {
  const { toast } = useToast();

  // Query for API stats
  const { data: apiStats, error, isLoading, refetch } = useQuery<StatsResponse>({
    queryKey: ['/api/admin/stats'],
    refetchInterval: 30000, // Refetch every 30 seconds
  });

  // Handle refresh button click
  const handleRefresh = () => {
    refetch();
    toast({
      title: "Refreshed",
      description: "Stats data has been updated",
    });
  };

  // Show loading state
  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-[50vh]">
        <div className="text-center">
          <h1 className="text-xl font-bold mb-4">Loading API Stats</h1>
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary mx-auto"></div>
        </div>
      </div>
    );
  }

  // Show error
  if (error) {
    return (
      <div className="py-4">
        <Alert variant="destructive" className="mb-6">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>
            Failed to load API stats data. Please try again later.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="py-4">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-bold">API Stats & Monitoring</h2>
        <Button onClick={handleRefresh} size="sm" variant="outline" className="flex items-center gap-2">
          <Clock className="h-4 w-4" /> Refresh
        </Button>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        {/* OpenAI API Status Card */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Server className="h-5 w-5" />
              OpenAI API Status
            </CardTitle>
            <CardDescription>
              Current status and monitoring
            </CardDescription>
          </CardHeader>
          <CardContent>
            {apiStats?.apiMonitoring?.openai && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="font-medium">Status:</span>
                  <Badge 
                    variant={apiStats.apiMonitoring.openai.configured ? "outline" : "destructive"}
                    className={apiStats.apiMonitoring.openai.configured ? "bg-green-100 text-green-800" : ""}
                  >
                    {apiStats.apiMonitoring.openai.configured ? "Available" : "Not Configured"}
                  </Badge>
                </div>
                
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span>Daily Usage:</span>
                    <span className="font-medium">
                      {apiStats.apiMonitoring.openai.usageToday} / {apiStats.apiMonitoring.openai.dailyLimit}
                    </span>
                  </div>
                  <Progress 
                    value={apiStats.apiMonitoring.openai.dailyLimit 
                      ? (apiStats.apiMonitoring.openai.usageToday / apiStats.apiMonitoring.openai.dailyLimit) * 100 
                      : 0} 
                    className="h-2" 
                  />
                </div>
                
                <div className="pt-2">
                  <h4 className="font-semibold mb-2">Failure Monitoring</h4>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span>Failure Count:</span>
                      <Badge variant={apiStats.apiMonitoring.openai.failureCount > 0 ? "destructive" : "outline"}>
                        {apiStats.apiMonitoring.openai.failureCount}
                      </Badge>
                    </div>
                    
                    <div className="flex justify-between">
                      <span>Affected Users:</span>
                      <span>{apiStats.apiMonitoring.openai.affectedUsers}</span>
                    </div>
                    
                    {apiStats.apiMonitoring.openai.isCritical && (
                      <Alert variant="destructive" className="mt-2">
                        <AlertTriangle className="h-4 w-4" />
                        <AlertTitle>Critical Issue Detected</AlertTitle>
                        <AlertDescription>
                          Multiple failures affecting several users. This requires immediate attention.
                        </AlertDescription>
                      </Alert>
                    )}
                    
                    {apiStats.apiMonitoring.openai.lastFailure && (
                      <div className="flex justify-between text-sm text-muted-foreground">
                        <span>Last failure:</span>
                        <span>{new Date(apiStats.apiMonitoring.openai.lastFailure).toLocaleString()}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
        
        {/* System Health Card */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Activity className="h-5 w-5" />
              System Health
            </CardTitle>
            <CardDescription>
              Overall system health metrics
            </CardDescription>
          </CardHeader>
          <CardContent>
            {apiStats?.health && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="font-medium">Status:</span>
                  <Badge 
                    variant={apiStats.health.status === 'healthy' ? "outline" : "destructive"}
                    className={apiStats.health.status === 'healthy' ? "bg-green-100 text-green-800" : ""}
                  >
                    {apiStats.health.status === 'healthy' ? "Healthy" : "Issues Detected"}
                  </Badge>
                </div>
                
                <Separator />
                
                <div className="space-y-2">
                  <h4 className="font-semibold">Memory Usage</h4>
                  <div className="flex justify-between items-center text-sm">
                    <span>Used / Total:</span>
                    <span>
                      {Math.round(apiStats.health.memory?.used / 1024 / 1024)} MB / 
                      {Math.round(apiStats.health.memory?.total / 1024 / 1024)} MB
                    </span>
                  </div>
                  <Progress 
                    value={apiStats.health.memory?.usedPercentage || 0} 
                    className="h-2" 
                  />
                </div>
                
                <div className="space-y-2">
                  <h4 className="font-semibold">CPU Load</h4>
                  <div className="flex justify-between items-center text-sm">
                    <span>Current Load:</span>
                    <span>{apiStats.health.cpu?.loadPercentage.toFixed(1)}%</span>
                  </div>
                  <Progress 
                    value={apiStats.health.cpu?.loadPercentage || 0} 
                    className="h-2" 
                  />
                </div>
                
                <div className="flex justify-between text-sm text-muted-foreground pt-2">
                  <span>Last updated:</span>
                  <span>{new Date(apiStats.timestamp).toLocaleString()}</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      
      <Card>
        <CardHeader>
          <CardTitle>API Usage Statistics</CardTitle>
          <CardDescription>
            Current usage and rate limits for all APIs
          </CardDescription>
        </CardHeader>
        <CardContent>
          {apiStats && Object.entries(apiStats)
            .filter(([key]) => key !== 'timestamp' && key !== 'health' && key !== 'apiMonitoring')
            .map(([key, value]: [string, any]) => (
              <div key={key} className="mb-6 last:mb-0">
                <h3 className="text-lg font-semibold mb-2 capitalize">{key} API</h3>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-sm">Current Window:</span>
                        <span className="text-sm font-medium">
                          {value.windowUsage} / minute
                        </span>
                      </div>
                      <Progress value={(value.windowUsage / 10) * 100} className="h-1.5" />
                    </div>
                    
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-sm">Daily Usage:</span>
                        <span className="text-sm font-medium">
                          {value.dailyUsage} / {value.dailyLimit}
                        </span>
                      </div>
                      <Progress 
                        value={(value.dailyUsage / value.dailyLimit) * 100} 
                        className="h-1.5" 
                      />
                    </div>
                  </div>
                  
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Status:</span>
                    {value.withinLimits ? (
                      <Badge variant="outline" className="bg-green-100 text-green-800">
                        <CheckCircle className="h-3 w-3 mr-1" /> 
                        Within Limits
                      </Badge>
                    ) : (
                      <Badge variant="destructive">
                        <AlertCircle className="h-3 w-3 mr-1" />
                        Rate Limited
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
            ))}
        </CardContent>
      </Card>
    </div>
  );
}