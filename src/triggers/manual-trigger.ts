/**
 * Manual Trigger
 * Allows user to manually trigger evolution
 */

import { TriggerType } from '../types.js';

export type TriggerCallback = (type: TriggerType, options?: ManualTriggerOptions) => Promise<void>;

export interface ManualTriggerOptions {
  target?: string;      // Specific target to analyze
  type?: 'skill' | 'config' | 'memory' | 'framework';
  fullAnalysis?: boolean;  // Run all analyzers
  reportOnly?: boolean;    // Only generate reports, no L0/L1 execution
}

export class ManualTrigger {
  private callback: TriggerCallback | null = null;
  private lastTriggered: Date | null = null;

  constructor() {}

  /**
   * Set the callback to be called when trigger fires
   */
  onTrigger(callback: TriggerCallback): void {
    this.callback = callback;
  }

  /**
   * Trigger evolution manually
   */
  async trigger(options?: ManualTriggerOptions): Promise<boolean> {
    if (!this.callback) {
      return false;
    }

    this.lastTriggered = new Date();
    await this.callback('manual', options);
    return true;
  }

  /**
   * Trigger evolution for a specific target
   */
  async triggerForTarget(target: string, type?: ManualTriggerOptions['type']): Promise<boolean> {
    return this.trigger({ target, type });
  }

  /**
   * Trigger full analysis
   */
  async triggerFullAnalysis(): Promise<boolean> {
    return this.trigger({ fullAnalysis: true });
  }

  /**
   * Trigger report-only mode
   */
  async triggerReportOnly(): Promise<boolean> {
    return this.trigger({ reportOnly: true });
  }

  /**
   * Get last trigger time
   */
  getLastTriggered(): Date | null {
    return this.lastTriggered;
  }
}
