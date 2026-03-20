/**
 * Metrics Storage
 * Tracks effectiveness indicators for evolution impact measurement
 */

import { EffectivenessMetrics } from '../types.js';
import * as fs from 'fs';
import * as path from 'path';

interface MetricEntry {
  timestamp: Date;
  type: 'success' | 'error' | 'user_feedback';
  skillName?: string;
  details: Record<string, unknown>;
}

export interface AggregatedMetrics {
  period: 'hour' | 'day' | 'week' | 'month';
  start: Date;
  end: Date;
  totalExecutions: number;
  successCount: number;
  errorCount: number;
  successRate: number;
  bySkill: Record<string, { success: number; error: number }>;
}

export class MetricsStore {
  private metricsPath: string;
  private entries: MetricEntry[] = [];
  private maxEntries: number = 10000;

  constructor(dataDir: string) {
    this.metricsPath = path.join(dataDir, 'metrics.json');
    this.load();
  }

  /**
   * Record a successful execution
   */
  async recordSuccess(skillName?: string, details?: Record<string, unknown>): Promise<void> {
    const entry: MetricEntry = {
      timestamp: new Date(),
      type: 'success',
      skillName,
      details: details || {},
    };

    this.entries.unshift(entry);
    this.trim();
    await this.save();
  }

  /**
   * Record an error
   */
  async recordError(skillName?: string, details?: Record<string, unknown>): Promise<void> {
    const entry: MetricEntry = {
      timestamp: new Date(),
      type: 'error',
      skillName,
      details: details || {},
    };

    this.entries.unshift(entry);
    this.trim();
    await this.save();
  }

  /**
   * Record user feedback
   */
  async recordFeedback(skillName: string, rating: number, comment?: string): Promise<void> {
    const entry: MetricEntry = {
      timestamp: new Date(),
      type: 'user_feedback',
      skillName,
      details: { rating, comment },
    };

    this.entries.unshift(entry);
    this.trim();
    await this.save();
  }

  /**
   * Get aggregated metrics for a period
   */
  getAggregated(period: 'hour' | 'day' | 'week' | 'month'): AggregatedMetrics {
    const now = new Date();
    const start = this.getPeriodStart(now, period);

    const relevantEntries = this.entries.filter(
      e => new Date(e.timestamp) >= start
    );

    const successCount = relevantEntries.filter(e => e.type === 'success').length;
    const errorCount = relevantEntries.filter(e => e.type === 'error').length;
    const totalExecutions = successCount + errorCount;

    const bySkill: Record<string, { success: number; error: number }> = {};
    for (const entry of relevantEntries) {
      if (!entry.skillName) continue;
      if (!bySkill[entry.skillName]) {
        bySkill[entry.skillName] = { success: 0, error: 0 };
      }
      if (entry.type === 'success') {
        bySkill[entry.skillName].success++;
      } else if (entry.type === 'error') {
        bySkill[entry.skillName].error++;
      }
    }

    return {
      period,
      start,
      end: now,
      totalExecutions,
      successCount,
      errorCount,
      successRate: totalExecutions > 0 ? successCount / totalExecutions : 0,
      bySkill,
    };
  }

  /**
   * Get effectiveness metrics for evolution tracking
   */
  getEffectivenessMetrics(
    beforeStart: Date,
    beforeEnd: Date,
    afterStart: Date,
    afterEnd: Date
  ): EffectivenessMetrics {
    const beforeEntries = this.entries.filter(
      e => {
        const t = new Date(e.timestamp);
        return t >= beforeStart && t < beforeEnd;
      }
    );

    const afterEntries = this.entries.filter(
      e => {
        const t = new Date(e.timestamp);
        return t >= afterStart && t <= afterEnd;
      }
    );

    const errorsBefore = beforeEntries.filter(e => e.type === 'error').length;
    const errorsAfter = afterEntries.filter(e => e.type === 'error').length;

    const successBefore = beforeEntries.filter(e => e.type === 'success').length;
    const successAfter = afterEntries.filter(e => e.type === 'success').length;

    const totalBefore = errorsBefore + successBefore;
    const totalAfter = errorsAfter + successAfter;

    return {
      errorsBefore,
      errorsAfter,
      successRateBefore: totalBefore > 0 ? successBefore / totalBefore : 0,
      successRateAfter: totalAfter > 0 ? successAfter / totalAfter : 0,
      period: 'day',
    };
  }

  /**
   * Get trending skills (improving or degrading)
   */
  getTrending(): {
    improving: string[];
    degrading: string[];
  } {
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);

    const recent = this.getAggregated('day');
    const skills = Object.keys(recent.bySkill);

    const improving: string[] = [];
    const degrading: string[] = [];

    for (const skill of skills) {
      const recentEntries = this.entries.filter(
        e => e.skillName === skill && new Date(e.timestamp) >= dayAgo
      );
      const olderEntries = this.entries.filter(
        e => e.skillName === skill &&
             new Date(e.timestamp) >= twoDaysAgo &&
             new Date(e.timestamp) < dayAgo
      );

      const recentErrors = recentEntries.filter(e => e.type === 'error').length;
      const olderErrors = olderEntries.filter(e => e.type === 'error').length;

      const recentTotal = recentEntries.length;
      const olderTotal = olderEntries.length;

      if (recentTotal >= 3 && olderTotal >= 3) {
        const recentRate = recentErrors / recentTotal;
        const olderRate = olderErrors / olderTotal;

        if (recentRate < olderRate * 0.7) {
          improving.push(skill);
        } else if (recentRate > olderRate * 1.3) {
          degrading.push(skill);
        }
      }
    }

    return { improving, degrading };
  }

  // ============================================
  // Private methods
  // ============================================

  private getPeriodStart(now: Date, period: 'hour' | 'day' | 'week' | 'month'): Date {
    const start = new Date(now);

    switch (period) {
      case 'hour':
        start.setHours(start.getHours() - 1);
        break;
      case 'day':
        start.setDate(start.getDate() - 1);
        break;
      case 'week':
        start.setDate(start.getDate() - 7);
        break;
      case 'month':
        start.setMonth(start.getMonth() - 1);
        break;
    }

    return start;
  }

  private trim(): void {
    if (this.entries.length > this.maxEntries) {
      this.entries = this.entries.slice(0, this.maxEntries);
    }
  }

  private load(): void {
    try {
      if (fs.existsSync(this.metricsPath)) {
        const data = fs.readFileSync(this.metricsPath, 'utf-8');
        this.entries = JSON.parse(data);
      }
    } catch {
      this.entries = [];
    }
  }

  private async save(): Promise<void> {
    const dir = path.dirname(this.metricsPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(this.metricsPath, JSON.stringify(this.entries, null, 2));
  }
}
