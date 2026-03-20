/**
 * Rollback Manager
 * Handles undoing evolution changes
 */

import { Snapshot, EvolutionRecord } from '../types.js';
import { EvolutionLog } from '../storage/index.js';
import * as fs from 'fs';
import * as path from 'path';

export interface RollbackResult {
  success: boolean;
  evolutionId: string;
  restoredPath: string;
  error?: string;
}

export class RollbackManager {
  private evolutionLog: EvolutionLog;

  constructor(evolutionLog: EvolutionLog) {
    this.evolutionLog = evolutionLog;
  }

  /**
   * Rollback an evolution
   */
  async rollback(evolutionId: string, reason: string): Promise<RollbackResult> {
    const record = this.evolutionLog.getById(evolutionId);

    if (!record) {
      return {
        success: false,
        evolutionId,
        restoredPath: '',
        error: 'Evolution record not found',
      };
    }

    if (record.status === 'rolled_back') {
      return {
        success: false,
        evolutionId,
        restoredPath: '',
        error: 'Evolution already rolled back',
      };
    }

    try {
      // Restore the before snapshot
      await this.restoreSnapshot(record.before);

      // Update the log
      await this.evolutionLog.rollback(evolutionId, reason);

      return {
        success: true,
        evolutionId,
        restoredPath: record.before.path,
      };
    } catch (error) {
      return {
        success: false,
        evolutionId,
        restoredPath: '',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Rollback the last N evolutions
   */
  async rollbackLast(count: number = 1, reason: string): Promise<RollbackResult[]> {
    const recent = this.evolutionLog.getActive().slice(0, count);
    const results: RollbackResult[] = [];

    for (const record of recent) {
      const result = await this.rollback(record.id, reason);
      results.push(result);
    }

    return results;
  }

  /**
   * Rollback all evolutions after a specific point
   */
  async rollbackAfter(evolutionId: string, reason: string): Promise<RollbackResult[]> {
    const records = this.evolutionLog.getActive();
    const targetIndex = records.findIndex(r => r.id === evolutionId);

    if (targetIndex === -1) {
      return [];
    }

    // Rollback all evolutions that came after (more recent)
    const toRollback = records.slice(0, targetIndex);
    const results: RollbackResult[] = [];

    for (const record of toRollback) {
      const result = await this.rollback(record.id, reason);
      results.push(result);
    }

    return results;
  }

  /**
   * List rollbackable evolutions
   */
  listRollbackable(): EvolutionRecord[] {
    return this.evolutionLog.getActive();
  }

  /**
   * Check if an evolution can be rolled back
   */
  canRollback(evolutionId: string): {
    canRollback: boolean;
    reason?: string;
  } {
    const record = this.evolutionLog.getById(evolutionId);

    if (!record) {
      return { canRollback: false, reason: 'Evolution not found' };
    }

    if (record.status === 'rolled_back') {
      return { canRollback: false, reason: 'Already rolled back' };
    }

    // Check if the file still exists
    if (record.before.type === 'file') {
      if (!fs.existsSync(record.before.path)) {
        return { canRollback: false, reason: 'Original file no longer exists' };
      }
    }

    return { canRollback: true };
  }

  // ============================================
  // Private methods
  // ============================================

  private async restoreSnapshot(snapshot: Snapshot): Promise<void> {
    switch (snapshot.type) {
      case 'file':
        await this.restoreFile(snapshot);
        break;
      case 'config':
        // Config restoration is handled by OpenClaw API
        break;
      case 'memory':
        // Memory restoration is handled by OpenClaw API
        break;
    }
  }

  private async restoreFile(snapshot: Snapshot): Promise<void> {
    const dir = path.dirname(snapshot.path);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(snapshot.path, snapshot.content);
  }
}
