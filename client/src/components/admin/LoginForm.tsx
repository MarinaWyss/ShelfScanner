import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertTitle } from '@/components/ui/alert';
import { AlertCircle } from 'lucide-react';

interface LoginFormProps {
  onLoginSuccess: (success: boolean) => void;
}

export default function LoginForm({ onLoginSuccess }: LoginFormProps) {
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  
  const { register, handleSubmit, formState: { errors } } = useForm({
    defaultValues: {
      username: '',
      password: ''
    }
  });

  const onSubmit = async (data: { username: string; password: string }) => {
    setIsLoading(true);
    setError(null);
    
    try {
      // Send login request
      const response = await fetch('/api/admin/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
      });
      
      if (response.ok) {
        // Login successful
        onLoginSuccess(true);
      } else {
        // Handle error
        const errorData = await response.json();
        setError(errorData.message || 'Invalid username or password');
        onLoginSuccess(false);
      }
    } catch (err) {
      setError('An error occurred during login. Please try again.');
      onLoginSuccess(false);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>{error}</AlertTitle>
        </Alert>
      )}
      
      <div className="space-y-2">
        <Label htmlFor="username">Username</Label>
        <Input
          id="username"
          placeholder="Enter username"
          {...register('username', { required: 'Username is required' })}
        />
        {errors.username && (
          <p className="text-sm text-red-500">{errors.username.message}</p>
        )}
      </div>
      
      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          type="password"
          placeholder="Enter password"
          {...register('password', { required: 'Password is required' })}
        />
        {errors.password && (
          <p className="text-sm text-red-500">{errors.password.message}</p>
        )}
      </div>
      
      <Button type="submit" className="w-full" disabled={isLoading}>
        {isLoading ? 'Logging in...' : 'Log in'}
      </Button>
      
      <div className="text-xs text-gray-500 mt-4">
        <p>Default credentials:</p>
        <p>Username: admin</p>
        <p>Password: admin1234</p>
        <p className="mt-1">Note: Change these in production by setting ADMIN_USERNAME and ADMIN_PASSWORD_HASH environment variables.</p>
      </div>
    </form>
  );
}