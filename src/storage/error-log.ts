/**
 * Error Log Storage
 * Records all errors for analysis and pattern detection
 */

import { ErrorLogEntry, ErrorContext } from '../types.js';
import * as fs from 'fs';
import * as path from 'path';

export class ErrorLog {
  private logPath: string;
  private entries: ErrorLogEntry[] = [];
  private maxEntries: number = 1000;

  constructor(dataDir: string) {
    this.logPath = path.join(dataDir, 'error-log.json');
    this.load();
  }

  /**
   * Log a new error
   */
  async log(error: ErrorContext): Promise<string> {
    const entry: ErrorLogEntry = {
      id: this.generateId(),
      timestamp: new Date(),
      error,
      resolved: false,
    };

    this.entries.unshift(entry);

    // Trim old entries
    if (this.entries.length > this.maxEntries) {
      this.entries = this.entries.slice(0, this.maxEntries);
    }

    await this.save();
    return entry.id;
  }

  /**
   * Get recent errors
   */
  getRecent(count: number = 50): ErrorLogEntry[] {
    return this.entries.slice(0, count);
  }

  /**
   * Get errors by pattern
   */
  getByPattern(pattern: RegExp): ErrorLogEntry[] {
    return this.entries.filter(e =>
      pattern.test(e.error.errorMessage) ||
      pattern.test(e.error.errorType)
    );
  }

  /**
   * Get errors for a specific skill
   */
  getBySkill(skillName: string): ErrorLogEntry[] {
    return this.entries.filter(e => e.error.skillName === skillName);
  }

  /**
   * Get unresolved errors
   */
  getUnresolved(): ErrorLogEntry[] {
    return this.entries.filter(e => !e.resolved);
  }

  /**
   * Mark an error as resolved
   */
  async resolve(errorId: string, resolvedBy: string): Promise<void> {
    const entry = this.entries.find(e => e.id === errorId);
    if (entry) {
      entry.resolved = true;
      entry.resolvedBy = resolvedBy;
      await this.save();
    }
  }

  /**
   * Get error statistics
   */
  getStats(): {
    total: number;
    unresolved: number;
    byType: Record<string, number>;
    bySkill: Record<string, number>;
    last24Hours: number;
  } {
    const now = Date.now();
    const dayAgo = now - 24 * 60 * 60 * 1000;

    const byType: Record<string, number> = {};
    const bySkill: Record<string, number> = {};

    for (const entry of this.entries) {
      // Count by type
      const type = entry.error.errorType;
      byType[type] = (byType[type] || 0) + 1;

      // Count by skill
      const skill = entry.error.skillName || 'unknown';
      bySkill[skill] = (bySkill[skill] || 0) + 1;
    }

    return {
      total: this.entries.length,
      unresolved: this.entries.filter(e => !e.resolved).length,
      byType,
      bySkill,
      last24Hours: this.entries.filter(e =>
        new Date(e.timestamp).getTime() > dayAgo
      ).length,
    };
  }

  /**
   * Clear all entries
   */
  async clear(): Promise<void> {
    this.entries = [];
    await this.save();
  }

  // ============================================
  // Private methods
  // ============================================

  private generateId(): string {
    return `err-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private load(): void {
    try {
      if (fs.existsSync(this.logPath)) {
        const data = fs.readFileSync(this.logPath, 'utf-8');
        this.entries = JSON.parse(data);
      }
    } catch {
      this.entries = [];
    }
  }

  private async save(): Promise<void> {
    const dir = path.dirname(this.logPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(this.logPath, JSON.stringify(this.entries, null, 2));
  }
}
