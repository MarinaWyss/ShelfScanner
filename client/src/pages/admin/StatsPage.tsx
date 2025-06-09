import { useEffect } from 'react';
import { Link, useLocation } from 'wouter';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import AdminStatsPage from './AdminStatsPage';

/**
 * Stats Page wrapper that handles authentication
 * This is a separate route component for /admin/stats
 */
export default function StatsPage() {
  const [, setLocation] = useLocation();

  // Check authentication on load
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const response = await fetch('/api/admin/check-auth');
        if (!response.ok) {
          // Redirect to admin login if not authenticated
          setLocation('/admin');
        }
      } catch (error) {
        console.log('Error checking authentication:', error);
        setLocation('/admin');
      }
    };
    
    checkAuth();
  }, [setLocation]);

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="flex items-center mb-6">
        <Button asChild variant="outline" size="sm" className="mr-4">
          <Link href="/admin">
            <ArrowLeft className="h-4 w-4 mr-2" /> Back to Dashboard
          </Link>
        </Button>
        <h1 className="text-2xl font-bold">API Statistics</h1>
      </div>
      
      <AdminStatsPage />
    </div>
  );
}