/**
 * Rate Limiter
 * Limits the frequency of evolution executions
 */

import { RateLimit, RiskLevel } from '../types.js';
import * as fs from 'fs';
import * as path from 'path';

interface RateLimitConfig {
  L0: RateLimit;
  L1: RateLimit;
  L2: RateLimit;
}

const DEFAULT_LIMITS: RateLimitConfig = {
  L0: { perHour: 10, perDay: 50 },
  L1: { perHour: 5, perDay: 20 },
  L2: { perHour: 20, perDay: 100 }, // Reports are cheap
};

interface ExecutionRecord {
  timestamp: number;
  level: RiskLevel;
}

export class RateLimiter {
  private limits: RateLimitConfig;
  private records: ExecutionRecord[] = [];
  private recordsPath: string;

  constructor(dataDir: string, limits?: Partial<RateLimitConfig>) {
    this.limits = { ...DEFAULT_LIMITS, ...limits };
    this.recordsPath = path.join(dataDir, 'rate-limits.json');
    this.load();
    this.cleanOldRecords();
  }

  /**
   * Check if execution is allowed for a risk level
   */
  canExecute(level: RiskLevel): {
    allowed: boolean;
    reason?: string;
    remainingHour: number;
    remainingDay: number;
  } {
    // L3 is always forbidden, no rate limiting needed
    if (level === 'L3') {
      return {
        allowed: false,
        reason: 'L3 changes are forbidden',
        remainingHour: 0,
        remainingDay: 0,
      };
    }

    const now = Date.now();
    const hourAgo = now - 60 * 60 * 1000;
    const dayAgo = now - 24 * 60 * 60 * 1000;

    const hourExecutions = this.records.filter(
      r => r.timestamp > hourAgo && r.level === level
    ).length;

    const dayExecutions = this.records.filter(
      r => r.timestamp > dayAgo && r.level === level
    ).length;

    const limit = this.limits[level as 'L0' | 'L1' | 'L2'];
    const remainingHour = Math.max(0, limit.perHour - hourExecutions);
    const remainingDay = Math.max(0, limit.perDay - dayExecutions);

    if (hourExecutions >= limit.perHour) {
      return {
        allowed: false,
        reason: `Hourly limit reached for ${level} (${limit.perHour}/hour)`,
        remainingHour: 0,
        remainingDay,
      };
    }

    if (dayExecutions >= limit.perDay) {
      return {
        allowed: false,
        reason: `Daily limit reached for ${level} (${limit.perDay}/day)`,
        remainingHour,
        remainingDay: 0,
      };
    }

    return {
      allowed: true,
      remainingHour,
      remainingDay,
    };
  }

  /**
   * Record an execution
   */
  async recordExecution(level: RiskLevel): Promise<void> {
    this.records.push({
      timestamp: Date.now(),
      level,
    });
    this.cleanOldRecords();
    await this.save();
  }

  /**
   * Get current usage stats
   */
  getUsage(): Record<RiskLevel, { hour: number; day: number; limitHour: number; limitDay: number }> {
    const now = Date.now();
    const hourAgo = now - 60 * 60 * 1000;
    const dayAgo = now - 24 * 60 * 60 * 1000;

    const result = {} as Record<RiskLevel, { hour: number; day: number; limitHour: number; limitDay: number }>;

    for (const level of ['L0', 'L1', 'L2'] as const) {
      const hourCount = this.records.filter(
        r => r.timestamp > hourAgo && r.level === level
      ).length;

      const dayCount = this.records.filter(
        r => r.timestamp > dayAgo && r.level === level
      ).length;

      result[level] = {
        hour: hourCount,
        day: dayCount,
        limitHour: this.limits[level].perHour,
        limitDay: this.limits[level].perDay,
      };
    }

    return result;
  }

  /**
   * Update limits
   */
  updateLimits(limits: Partial<RateLimitConfig>): void {
    this.limits = { ...this.limits, ...limits };
  }

  // ============================================
  // Private methods
  // ============================================

  private cleanOldRecords(): void {
    const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
    this.records = this.records.filter(r => r.timestamp > dayAgo);
  }

  private load(): void {
    try {
      if (fs.existsSync(this.recordsPath)) {
        const data = fs.readFileSync(this.recordsPath, 'utf-8');
        this.records = JSON.parse(data);
      }
    } catch {
      this.records = [];
    }
  }

  private async save(): Promise<void> {
    const dir = path.dirname(this.recordsPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(this.recordsPath, JSON.stringify(this.records, null, 2));
  }
}
