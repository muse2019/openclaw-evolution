/**
 * Evolution Log Storage
 * Records all evolution changes for history and rollback
 */

import { EvolutionRecord, Snapshot } from '../types.js';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

export class EvolutionLog {
  private logPath: string;
  private records: EvolutionRecord[] = [];
  private maxRecords: number = 500;

  constructor(dataDir: string) {
    this.logPath = path.join(dataDir, 'evolution-log.json');
    this.load();
  }

  /**
   * Record a new evolution
   */
  async record(
    proposal: EvolutionRecord['proposal'],
    before: Snapshot,
    after: Snapshot
  ): Promise<string> {
    const record: EvolutionRecord = {
      id: proposal.id,
      timestamp: new Date(),
      proposal,
      before,
      after,
      status: 'active',
    };

    this.records.unshift(record);

    // Trim old records
    if (this.records.length > this.maxRecords) {
      this.records = this.records.slice(0, this.maxRecords);
    }

    await this.save();
    return record.id;
  }

  /**
   * Get evolution by ID
   */
  getById(id: string): EvolutionRecord | undefined {
    return this.records.find(r => r.id === id);
  }

  /**
   * Get recent evolutions
   */
  getRecent(count: number = 20): EvolutionRecord[] {
    return this.records.slice(0, count);
  }

  /**
   * Get active evolutions
   */
  getActive(): EvolutionRecord[] {
    return this.records.filter(r => r.status === 'active');
  }

  /**
   * Get evolutions for a target
   */
  getByTarget(target: string): EvolutionRecord[] {
    return this.records.filter(r => r.proposal.target === target);
  }

  /**
   * Rollback an evolution
   */
  async rollback(id: string, reason: string): Promise<Snapshot | null> {
    const record = this.records.find(r => r.id === id);

    if (!record || record.status !== 'active') {
      return null;
    }

    record.status = 'rolled_back';
    record.rolledBackAt = new Date();
    record.rolledBackReason = reason;

    await this.save();
    return record.before;
  }

  /**
   * Update effectiveness metrics
   */
  async updateEffectiveness(
    id: string,
    metrics: EvolutionRecord['effectiveness']
  ): Promise<void> {
    const record = this.records.find(r => r.id === id);
    if (record) {
      record.effectiveness = metrics;
      await this.save();
    }
  }

  /**
   * Get statistics
   */
  getStats(): {
    total: number;
    active: number;
    rolledBack: number;
    byRiskLevel: Record<string, number>;
    byTarget: Record<string, number>;
    avgEffectiveness: number;
  } {
    const byRiskLevel: Record<string, number> = {};
    const byTarget: Record<string, number> = {};
    let effectivenessSum = 0;
    let effectivenessCount = 0;

    for (const record of this.records) {
      const level = record.proposal.riskLevel || 'unknown';
      byRiskLevel[level] = (byRiskLevel[level] || 0) + 1;

      const target = record.proposal.type;
      byTarget[target] = (byTarget[target] || 0) + 1;

      if (record.effectiveness) {
        effectivenessSum += record.effectiveness.successRateAfter -
                           record.effectiveness.successRateBefore;
        effectivenessCount++;
      }
    }

    return {
      total: this.records.length,
      active: this.records.filter(r => r.status === 'active').length,
      rolledBack: this.records.filter(r => r.status === 'rolled_back').length,
      byRiskLevel,
      byTarget,
      avgEffectiveness: effectivenessCount > 0
        ? effectivenessSum / effectivenessCount
        : 0,
    };
  }

  // ============================================
  // Static helpers
  // ============================================

  /**
   * Create a snapshot of a file
   */
  static createFileSnapshot(filePath: string, content: string): Snapshot {
    return {
      type: 'file',
      path: filePath,
      content,
      hash: crypto.createHash('sha256').update(content).digest('hex'),
      timestamp: new Date(),
    };
  }

  /**
   * Create a snapshot of config
   */
  static createConfigSnapshot(key: string, value: unknown): Snapshot {
    const content = JSON.stringify(value);
    return {
      type: 'config',
      path: key,
      content,
      hash: crypto.createHash('sha256').update(content).digest('hex'),
      timestamp: new Date(),
    };
  }

  // ============================================
  // Private methods
  // ============================================

  private load(): void {
    try {
      if (fs.existsSync(this.logPath)) {
        const data = fs.readFileSync(this.logPath, 'utf-8');
        this.records = JSON.parse(data);
      }
    } catch {
      this.records = [];
    }
  }

  private async save(): Promise<void> {
    const dir = path.dirname(this.logPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(this.logPath, JSON.stringify(this.records, null, 2));
  }
}
