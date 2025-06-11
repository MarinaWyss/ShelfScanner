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
      <p><em>Check your admin dashboard for more details: <a href="${process.env.HOST || 'https://shelfscanner.app'}/admin">Admin Dashboard</a></em></p>
    `
  });
}

/**
 * Send a system health alert
 * @param status System health status
 * @param metrics Health metrics
 */
export async function sendSystemHealthAlert(
  status: 'warning' | 'critical', 
  metrics: any
): Promise<boolean> {
  const emoji = status === 'critical' ? '🚨' : '⚠️';
  const title = `${emoji} System Health ${status === 'critical' ? 'Critical' : 'Warning'}`;
  
  const healthSummary = `
    <h2>System Health Alert</h2>
    <p>Your application is showing ${status} health indicators:</p>
    <ul>
      <li><strong>Memory Usage:</strong> ${metrics.memory?.usedPercentage?.toFixed(1)}% (${Math.round(metrics.memory?.used / 1024 / 1024)} MB / ${Math.round(metrics.memory?.total / 1024 / 1024)} MB)</li>
      <li><strong>CPU Load:</strong> ${metrics.cpu?.loadPercentage?.toFixed(1)}%</li>
      <li><strong>Disk Usage:</strong> ${metrics.disk?.usedPercentage?.toFixed(1)}%</li>
      <li><strong>Uptime:</strong> ${Math.floor(metrics.uptime / 3600)} hours</li>
    </ul>
    
    ${status === 'critical' ? `
      <div style="background-color: #fee; border: 1px solid #f00; padding: 10px; margin: 10px 0;">
        <h3>Immediate Action Required</h3>
        <p>Your system is in critical condition. Consider:</p>
        <ul>
          <li>Restarting the application to free memory</li>
          <li>Checking for memory leaks or runaway processes</li>
          <li>Scaling up server resources if persistently high usage</li>
          <li>Reviewing recent error logs</li>
        </ul>
      </div>
    ` : `
      <div style="background-color: #ffc; border: 1px solid #fa0; padding: 10px; margin: 10px 0;">
        <h3>Monitoring Recommended</h3>
        <p>Your system is showing warning signs. Monitor closely and consider preventive action.</p>
      </div>
    `}
    
    <p><strong>Time:</strong> ${new Date().toISOString()}</p>
    <p><em>View detailed metrics: <a href="${process.env.HOST || 'https://shelfscanner.app'}/admin">Admin Dashboard</a></em></p>
  `;
  
  return await sendAlertEmail({
    to: process.env.ADMIN_EMAIL || '',
    from: `alerts@${process.env.HOST || 'shelfscanner.app'}`,
    subject: title,
    html: healthSummary
  });
}

/**
 * Send database connectivity alert
 * @param error Database error
 */
export async function sendDatabaseAlert(error: string): Promise<boolean> {
  return await sendAlertEmail({
    to: process.env.ADMIN_EMAIL || '',
    from: `alerts@${process.env.HOST || 'shelfscanner.app'}`,
    subject: '💾 Database Connection Issue',
    html: `
      <h2>Database Connection Alert</h2>
      <p>There is an issue with the database connection:</p>
      <pre>${error}</pre>
      <p><strong>Impact:</strong> Users may experience issues with data persistence.</p>
      <p><strong>Action Required:</strong> Check database connectivity and server resources.</p>
      <p><strong>Time:</strong> ${new Date().toISOString()}</p>
      <p><em>Check admin dashboard: <a href="${process.env.HOST || 'https://shelfscanner.app'}/admin">Admin Dashboard</a></em></p>
    `
  });
}

/**
 * Send application startup notification
 */
export async function sendStartupNotification(): Promise<boolean> {
  return await sendAlertEmail({
    to: process.env.ADMIN_EMAIL || '',
    from: `alerts@${process.env.HOST || 'shelfscanner.app'}`,
    subject: '🚀 Application Started',
    html: `
      <h2>Application Startup</h2>
      <p>ShelfScanner application has started successfully.</p>
      <ul>
        <li><strong>Time:</strong> ${new Date().toISOString()}</li>
        <li><strong>Environment:</strong> ${process.env.NODE_ENV || 'development'}</li>
        <li><strong>Process ID:</strong> ${process.pid}</li>
        <li><strong>Memory:</strong> ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)} MB</li>
      </ul>
      <p><em>Monitor your application: <a href="${process.env.HOST || 'https://shelfscanner.app'}/admin">Admin Dashboard</a></em></p>
    `
  });
}

/**
 * Send daily summary report
 * @param stats Daily statistics
 */
export async function sendDailySummary(stats: any): Promise<boolean> {
  return await sendAlertEmail({
    to: process.env.ADMIN_EMAIL || '',
    from: `alerts@${process.env.HOST || 'shelfscanner.app'}`,
    subject: '📊 Daily Summary Report',
    html: `
      <h2>Daily Summary Report</h2>
      <p>Here's your daily activity summary for ${new Date().toDateString()}:</p>
      
      <h3>API Usage</h3>
      <ul>
        ${Object.entries(stats.apiUsage || {}).map(([api, usage]: [string, any]) => 
          `<li><strong>${api}:</strong> ${usage.requests} requests (${usage.errors} errors)</li>`
        ).join('')}
      </ul>
      
      <h3>System Health</h3>
      <ul>
        <li><strong>Peak Memory Usage:</strong> ${stats.peakMemory}%</li>
        <li><strong>Average CPU Load:</strong> ${stats.avgCpuLoad}%</li>
        <li><strong>Critical Events:</strong> ${stats.criticalEvents}</li>
        <li><strong>Warning Events:</strong> ${stats.warningEvents}</li>
      </ul>
      
      ${stats.criticalEvents > 0 ? `
        <div style="background-color: #fee; border: 1px solid #f00; padding: 10px; margin: 10px 0;">
          <strong>⚠️ Attention Required:</strong> ${stats.criticalEvents} critical events detected today.
        </div>
      ` : ''}
      
      <p><strong>Generated:</strong> ${new Date().toISOString()}</p>
      <p><em>View detailed analytics: <a href="${process.env.HOST || 'https://shelfscanner.app'}/admin">Admin Dashboard</a></em></p>
    `
  });
}