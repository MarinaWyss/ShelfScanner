import { Express, Request, Response } from 'express';

/**
 * Register environment variable routes to securely expose 
 * necessary environment variables to the client
 */
export function registerEnvRoutes(app: Express) {
  
  // Endpoint to get AdMob configuration
  app.get('/api/config/admob', (_req: Request, res: Response) => {
    res.json({
      android: {
        appId: process.env.ADMOB_ANDROID_APP_ID || '',
      },
      ios: {
        appId: process.env.ADMOB_IOS_APP_ID || '',
      }
    });
  });

}