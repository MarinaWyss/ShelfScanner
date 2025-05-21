import { Express, Request, Response } from 'express';

/**
 * Register environment variable routes to securely expose 
 * necessary environment variables to the client
 */
export function registerEnvRoutes(app: Express) {
  
  // Endpoint to get ad configuration
  app.get('/api/config/ads', (_req: Request, res: Response) => {
    res.json({
      // AdMob configuration (for future reference)
      admob: {
        android: {
          appId: process.env.ADMOB_ANDROID_APP_ID || '',
        },
        ios: {
          appId: process.env.ADMOB_IOS_APP_ID || '',
        }
      },
      // AdSense configuration (for web)
      adsense: {
        publisherId: process.env.ADSENSE_PUBLISHER_ID || ''
      }
    });
  });

}