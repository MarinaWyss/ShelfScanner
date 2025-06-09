#!/usr/bin/env node

/**
 * Security Check Script
 * Scans for common security issues in the codebase
 */

const fs = require('fs');
const path = require('path');

const SECURITY_PATTERNS = [
  {
    pattern: /console\.log.*process\.env\./g,
    description: 'Environment variable logging',
    severity: 'HIGH'
  },
  {
    pattern: /console\.log.*password\s*:|console\.log.*secret\s*:|console\.log.*\$\{.*key.*\}/gi,
    description: 'Potential sensitive data logging',
    severity: 'HIGH'
  },
  {
    pattern: /sk-[a-zA-Z0-9]+/g,
    description: 'Potential OpenAI API key',
    severity: 'CRITICAL'
  },
  {
    pattern: /password\s*=\s*["'][^"']+["']/gi,
    description: 'Hardcoded password',
    severity: 'CRITICAL'
  },
  {
    pattern: /api_key\s*=\s*["'][^"']+["']/gi,
    description: 'Hardcoded API key',
    severity: 'CRITICAL'
  }
];

function scanFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const issues = [];
  
  SECURITY_PATTERNS.forEach(({ pattern, description, severity }) => {
    const matches = content.match(pattern);
    if (matches) {
      matches.forEach(match => {
        issues.push({
          file: filePath,
          issue: description,
          severity,
          match: match.substring(0, 50) + (match.length > 50 ? '...' : '')
        });
      });
    }
  });
  
  return issues;
}

function scanDirectory(dir, ignore = ['node_modules', '.git', 'dist', 'logs']) {
  const issues = [];
  
  function scan(currentDir) {
    const items = fs.readdirSync(currentDir);
    
    items.forEach(item => {
      const fullPath = path.join(currentDir, item);
      const stats = fs.statSync(fullPath);
      
      if (stats.isDirectory() && !ignore.includes(item)) {
        scan(fullPath);
      } else if (stats.isFile() && /\.(js|ts|tsx|jsx)$/.test(item) && !item.includes('package-lock')) {
        // Skip package-lock.json to avoid false positives
        issues.push(...scanFile(fullPath));
      }
    });
  }
  
  scan(dir);
  return issues;
}

function main() {
  console.log('🔍 Running security scan...\n');
  
  const issues = scanDirectory(process.cwd());
  
  if (issues.length === 0) {
    console.log('✅ No security issues found!');
    return;
  }
  
  console.log(`⚠️  Found ${issues.length} potential security issue(s):\n`);
  
  issues.forEach((issue, index) => {
    console.log(`${index + 1}. [${issue.severity}] ${issue.issue}`);
    console.log(`   File: ${issue.file}`);
    console.log(`   Match: ${issue.match}`);
    console.log('');
  });
  
  const criticalIssues = issues.filter(i => i.severity === 'CRITICAL').length;
  const highIssues = issues.filter(i => i.severity === 'HIGH').length;
  
  console.log(`Summary: ${criticalIssues} critical, ${highIssues} high priority issues`);
  
  if (criticalIssues > 0) {
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { scanDirectory, scanFile }; 