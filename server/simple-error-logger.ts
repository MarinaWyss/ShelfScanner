// Simple error logging for Vercel serverless environment
// Logs are visible in Vercel dashboard

export interface ErrorContext {
  userId?: string;
  deviceId?: string;
  api?: string;
  action?: string;
  identifier?: string;
  limit?: number;
  current?: number;
  metadata?: Record<string, any>;
}

export function logError(
  message: string, 
  error?: Error | unknown, 
  context?: ErrorContext
): void {
  const timestamp = new Date().toISOString();
  const errorInfo = error instanceof Error ? {
    name: error.name,
    message: error.message,
    stack: error.stack
  } : error;

  console.error(`[${timestamp}] ERROR: ${message}`, {
    error: errorInfo,
    context,
  });
}

export function logWarning(message: string, context?: ErrorContext): void {
  const timestamp = new Date().toISOString();
  console.warn(`[${timestamp}] WARNING: ${message}`, context);
}

export function logInfo(message: string, context?: ErrorContext): void {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] INFO: ${message}`, context);
}

// Rate limiting specific logging
export function logRateLimit(
  api: string, 
  identifier: string, 
  limit: number, 
  current: number
): void {
  logWarning(`Rate limit hit for ${api}`, {
    api,
    identifier,
    limit,
    current,
    metadata: { rateLimitHit: true }
  });
}

// API usage logging
export function logApiUsage(
  api: string, 
  success: boolean, 
  responseTime?: number, 
  context?: ErrorContext
): void {
  const message = `${api} API call ${success ? 'succeeded' : 'failed'}`;
  const logContext = {
    ...context,
    api,
    success,
    responseTime,
    metadata: { apiCall: true, ...context?.metadata }
  };

  if (success) {
    logInfo(message, logContext);
  } else {
    logWarning(message, logContext);
  }
} 