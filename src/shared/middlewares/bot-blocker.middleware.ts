import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';

@Injectable()
export class BotBlockerMiddleware implements NestMiddleware {
  private readonly botPaths = [
    '/login.jsp',
    '/admin',
    '/wp-admin',
    '/wp-login.php',
    '/phpmyadmin',
    '/mysql',
    '/console',
    '/manager',
    '/solr',
    '/jenkins',
    '/actuator',
    '/.env',
    '/robots.txt',
    '/sitemap.xml',
    '/favicon.ico',
    '/.well-known',
    '/index.php',
    '/config.php',
    '/.git',
    '/database',
    '/backup',
    '/uploads',
    '/images',
    '/scripts',
    '/cgi-bin',
    '/test',
    '/tmp',
    '/var',
    '/etc',
    '/usr',
    '/home',
    '/root',
    '/bin',
    '/sbin',
    '/lib',
    '/opt',
    '/proc',
    '/sys',
    '/dev',
    '/mnt',
    '/media',
    '/api/login',
    '/api/admin',
    '/login',
    '/administrator',
    '/wp-',
    '/wordpress',
    '/joomla',
    '/drupal',
    '/magento',
    '/prestashop',
    '/opencart',
    '/typo3',
    '/concrete5',
    '/umbraco',
    '/sitecore',
    '/sharepoint',
    '/confluence',
    '/wiki',
    '/portal',
    '/cpanel',
    '/plesk',
    '/whm',
    '/webmin',
    '/nagios',
    '/zabbix',
    '/grafana',
    '/prometheus',
    '/kibana',
    '/elasticsearch',
    '/logstash',
    '/splunk',
  ];

  private readonly botPatterns = [
    /\.(php|asp|aspx|jsp|cgi|pl|py)$/i,
    /\.(bak|backup|old|orig|tmp|temp|~)$/i,
    /\.(log|txt|conf|cfg|ini|xml|json)$/i,
    /\/\.(git|svn|hg|bzr)\//i,
    /\/(admin|login|manage|control|panel|dashboard)/i,
    /\/(wp-|wordpress|joomla|drupal)/i,
    /\/(test|tmp|temp|backup|old)/i,
    /\/(etc|var|usr|home|root|bin|sbin|lib|opt|proc|sys|dev|mnt|media)\//i,
    /\/(upload|image|script|css|js|asset)\//i,
  ];

  use(req: Request, res: Response, next: NextFunction) {
    const { url, method, ip } = req;

    // Check if this is a bot/scanner request
    const isBotPath = this.botPaths.some((path) => url.startsWith(path));
    const matchesBotPattern = this.botPatterns.some((pattern) =>
      pattern.test(url),
    );

    // Also block requests with suspicious query parameters
    const hasSuspiciousQuery = this.hasSuspiciousQuery(url);

    if (isBotPath || matchesBotPattern || hasSuspiciousQuery) {
      // Silent block - no logging to reduce noise
      res.status(404).end();
      return;
    }

    // Block any request that doesn't match our known API patterns
    const isValidApiPath = this.isValidApiPath(url);
    if (!isValidApiPath) {
      res.status(404).end();
      return;
    }

    next();
  }

  private hasSuspiciousQuery(url: string): boolean {
    const suspiciousParams = [
      'exec',
      'cmd',
      'command',
      'shell',
      'script',
      'eval',
      'system',
      'passthru',
      'file',
      'path',
      'dir',
      'cat',
      'type',
      'union',
      'select',
      'insert',
      'update',
      'delete',
      'drop',
      'create',
      'alter',
      '../',
      '..\\',
      '%2e%2e',
      '%252e%252e',
    ];

    return suspiciousParams.some((param) => url.toLowerCase().includes(param));
  }

  private isValidApiPath(url: string): boolean {
    // Define your valid API paths here
    const validPaths = [
      '/',
      '/health-check',
      '/api/wallet-eth-balance',
      '/api-docs',
      '/swagger',
      '/docs',
    ];

    // Allow exact matches or paths that start with valid API paths
    return validPaths.some(
      (path) =>
        url === path ||
        url.startsWith(path + '/') ||
        url.startsWith(path + '?'),
    );
  }
}
