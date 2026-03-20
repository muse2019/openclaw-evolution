/**
 * Whitelist/Blacklist Path Checker
 * Validates paths against allowed and blocked patterns
 */

import * as path from 'path';
import * as fs from 'fs';

export interface PathConfig {
  allowlist: string[];
  blocklist: string[];
}

const DEFAULT_CONFIG: PathConfig = {
  allowlist: [
    // Skills directory
    '**/.openclaw/workspace/skills/**',
    '**/workspace/skills/**',
    // Config (non-sensitive)
    '**/.openclaw/config/preferences.json',
    '**/.openclaw/config/settings.json',
    // Memory
    '**/.openclaw/memory/**',
    '**/workspace/memory/**',
  ],
  blocklist: [
    // Authentication
    '**/.openclaw/auth/**',
    '**/auth/**',
    // Secrets
    '**/.openclaw/secrets/**',
    '**/secrets/**',
    '**/.env',
    '**/.env.*',
    '**/credentials.json',
    '**/api-keys.json',
    // Private keys
    '**/*.pem',
    '**/*.key',
    '**/id_rsa*',
  ],
};

export class PathChecker {
  private config: PathConfig;

  constructor(config?: Partial<PathConfig>) {
    this.config = {
      allowlist: config?.allowlist || DEFAULT_CONFIG.allowlist,
      blocklist: config?.blocklist || DEFAULT_CONFIG.blocklist,
    };
  }

  /**
   * Check if a path is allowed for modification
   */
  isAllowed(targetPath: string): {
    allowed: boolean;
    reason: string;
    matchedBlocklist?: string;
    matchedAllowlist?: string;
  } {
    const absolutePath = path.resolve(targetPath);

    // First check blocklist
    for (const pattern of this.config.blocklist) {
      if (this.matchPattern(pattern, absolutePath)) {
        return {
          allowed: false,
          reason: `Path matches blocked pattern: ${pattern}`,
          matchedBlocklist: pattern,
        };
      }
    }

    // Then check allowlist
    for (const pattern of this.config.allowlist) {
      if (this.matchPattern(pattern, absolutePath)) {
        return {
          allowed: true,
          reason: `Path matches allowed pattern: ${pattern}`,
          matchedAllowlist: pattern,
        };
      }
    }

    // Not in allowlist - default deny
    return {
      allowed: false,
      reason: 'Path not in allowlist',
    };
  }

  /**
   * Check if a path exists
   */
  exists(targetPath: string): boolean {
    return fs.existsSync(path.resolve(targetPath));
  }

  /**
   * Add to allowlist
   */
  addAllow(pattern: string): void {
    if (!this.config.allowlist.includes(pattern)) {
      this.config.allowlist.push(pattern);
    }
  }

  /**
   * Add to blocklist
   */
  addBlock(pattern: string): void {
    if (!this.config.blocklist.includes(pattern)) {
      this.config.blocklist.push(pattern);
    }
  }

  /**
   * Remove from allowlist
   */
  removeAllow(pattern: string): boolean {
    const index = this.config.allowlist.indexOf(pattern);
    if (index !== -1) {
      this.config.allowlist.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * Get current config
   */
  getConfig(): PathConfig {
    return { ...this.config };
  }

  // ============================================
  // Private methods
  // ============================================

  private matchPattern(pattern: string, targetPath: string): boolean {
    // Convert glob-like pattern to regex
    const regexPattern = pattern
      .replace(/\*\*/g, '<<<DOUBLE_STAR>>>')
      .replace(/\*/g, '[^/]*')
      .replace(/<<<DOUBLE_STAR>>>/g, '.*')
      .replace(/\?/g, '[^/]')
      .replace(/\./g, '\\.');

    const regex = new RegExp(`^${regexPattern}$`, 'i');
    return regex.test(targetPath.replace(/\\/g, '/'));
  }
}
