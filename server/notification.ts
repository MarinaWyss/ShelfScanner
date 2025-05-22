import { MailService } from '@sendgrid/mail';
import { logger } from './logger';

// Create SendGrid mail service
const mailService = new MailService();

// Initialize the mail service with API key if available
if (process.env.SENDGRID_API_KEY) {
  mailService.setApiKey(process.env.SENDGRID_API_KEY);
} 

// Cache to prevent duplicate alerts in a short time period
const alertCache = new Map<string, number>();
const ALERT_COOLDOWN_MS = 1000 * 60 * 15; // 15 minutes between similar alerts

interface EmailParams {
  to: string;
  from: string;
  subject: string;
  text?: string;
  html?: string;
}

/**
 * Send an email alert using SendGrid
 * @param params Email parameters
 * @returns Promise resolving to success status
 */
export async function sendAlertEmail(params: EmailParams): Promise<boolean> {
  if (!process.env.SENDGRID_API_KEY) {
    logger.warn('Cannot send alert email: SendGrid API key not configured');
    return false;
  }
  
  // Check for admin email configuration
  if (!process.env.ADMIN_EMAIL) {
    logger.warn('Cannot send alert email: Admin email not configured');
    return false;
  }
  
  try {
    // Create cache key from subject to prevent duplicate alerts
    const cacheKey = `alert:${params.subject}`;
    const now = Date.now();
    
    // Check if a similar alert was sent recently
    if (alertCache.has(cacheKey)) {
      const lastSent = alertCache.get(cacheKey) || 0;
      if (now - lastSent < ALERT_COOLDOWN_MS) {
        logger.debug(`Skipping duplicate alert: ${params.subject} (cooldown period)`);
        return false;
      }
    }
    
    // Update the cache with current timestamp
    alertCache.set(cacheKey, now);
    
    // Make sure we have valid to/from addresses
    const adminEmail = process.env.ADMIN_EMAIL || '';
    const fromEmail = `alerts@${process.env.HOST || 'shelfscanner.app'}`;
    
    // Send the email
    await mailService.send({
      to: params.to || adminEmail,
      from: params.from || fromEmail,
      subject: params.subject,
      text: params.text || '',
      html: params.html || '',
    });
    
    logger.info(`Alert email sent: ${params.subject}`);
    return true;
  } catch (error) {
    logger.error(`SendGrid email error: ${error}`);
    return false;
  }
}

/**
 * Send an alert for API rate limit approaching threshold
 * @param api API name
 * @param usage Current usage 
 * @param limit Rate limit
 */
export async function sendRateLimitAlert(api: string, usage: number, limit: number): Promise<boolean> {
  const usagePercent = ((usage / limit) * 100).toFixed(1);
  const adminEmail = process.env.ADMIN_EMAIL || '';
  const fromEmail = `alerts@${process.env.HOST || 'shelfscanner.app'}`;
  
  return await sendAlertEmail({
    to: adminEmail,
    from: fromEmail,
    subject: `⚠️ ${api} API usage at ${usagePercent}% of limit`,
    html: `
      <h2>API Rate Limit Alert</h2>
      <p>The ${api} API is approaching its rate limit:</p>
      <ul>
        <li><strong>Current Usage:</strong> ${usage}</li>
        <li><strong>Limit:</strong> ${limit}</li>
        <li><strong>Usage Percentage:</strong> ${usagePercent}%</li>
        <li><strong>Time:</strong> ${new Date().toISOString()}</li>
      </ul>
      <p>Please check the admin dashboard for more information.</p>
    `
  });
}

/**
 * Send a critical error alert
 * @param title Alert title
 * @param message Alert message
 * @param details Error details
 */
export async function sendErrorAlert(title: string, message: string, details?: any): Promise<boolean> {
  return await sendAlertEmail({
    to: process.env.ADMIN_EMAIL || '',
    from: `alerts@${process.env.HOST || 'shelfscanner.app'}`,
    subject: `🚨 ${title}`,
    html: `
      <h2>${title}</h2>
      <p>${message}</p>
      ${details ? `<pre>${JSON.stringify(details, null, 2)}</pre>` : ''}
      <p><strong>Time:</strong> ${new Date().toISOString()}</p>
    `
  });
}