/**
 * Error Trigger
 * Monitors for errors and triggers evolution when thresholds are met
 */

import { TriggerType, ErrorContext } from '../types.js';
import { ErrorLog } from '../storage/index.js';

export interface ErrorTriggerConfig {
  enabled: boolean;
  threshold: number;      // Number of errors before triggering
  cooldownMinutes: number; // Time between triggers
  patterns: string[];      // Specific error patterns to watch
}

const DEFAULT_CONFIG: ErrorTriggerConfig = {
  enabled: true,
  threshold: 3,
  cooldownMinutes: 30,
  patterns: [],
};

export type TriggerCallback = (type: TriggerType, context: ErrorContext[]) => Promise<void>;

export class ErrorTrigger {
  private config: ErrorTriggerConfig;
  private errorLog: ErrorLog;
  private callback: TriggerCallback | null = null;
  private lastTriggered: Date | null = null;

  constructor(errorLog: ErrorLog, config?: Partial<ErrorTriggerConfig>) {
    this.errorLog = errorLog;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Set the callback to be called when trigger fires
   */
  onTrigger(callback: TriggerCallback): void {
    this.callback = callback;
  }

  /**
   * Record an error and check if trigger should fire
   */
  async recordError(error: ErrorContext): Promise<boolean> {
    if (!this.config.enabled) {
      return false;
    }

    // Log the error
    await this.errorLog.log(error);

    // Check if we should trigger
    if (await this.shouldTrigger()) {
      await this.fire();
      return true;
    }

    return false;
  }

  /**
   * Check if the trigger should fire
   */
  private async shouldTrigger(): Promise<boolean> {
    // Check cooldown
    if (this.lastTriggered) {
      const cooldownMs = this.config.cooldownMinutes * 60 * 1000;
      const timeSinceLastTrigger = Date.now() - this.lastTriggered.getTime();
      if (timeSinceLastTrigger < cooldownMs) {
        return false;
      }
    }

    // Check threshold
    const stats = this.errorLog.getStats();
    if (stats.last24Hours >= this.config.threshold) {
      return true;
    }

    return false;
  }

  /**
   * Fire the trigger
   */
  private async fire(): Promise<void> {
    if (!this.callback) return;

    this.lastTriggered = new Date();

    // Get recent errors for context
    const recentErrors = this.errorLog.getRecent(this.config.threshold);

    await this.callback('error', recentErrors.map(e => e.error));
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<ErrorTriggerConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): ErrorTriggerConfig {
    return { ...this.config };
  }

  /**
   * Enable/disable the trigger
   */
  setEnabled(enabled: boolean): void {
    this.config.enabled = enabled;
  }
}
