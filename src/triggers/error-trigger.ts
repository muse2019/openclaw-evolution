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
  // Track per-pattern trigger times for cooldown
  private patternLastTriggered: Map<string, Date> = new Map();

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
    if (await this.shouldTrigger(error)) {
      await this.fire(error.errorType);
      return true;
    }

    return false;
  }

  /**
   * Check if the trigger should fire for a specific pattern
   */
  private async shouldTrigger(error: ErrorContext): Promise<boolean> {
    const patternKey = this.extractPatternKey(error);

    // Check per-pattern cooldown
    const lastPatternTrigger = this.patternLastTriggered.get(patternKey);
    if (lastPatternTrigger) {
      const cooldownMs = this.config.cooldownMinutes * 60 * 1000;
      const timeSinceLastTrigger = Date.now() - lastPatternTrigger.getTime();
      if (timeSinceLastTrigger < cooldownMs) {
        return false;
      }
    }

    // Check global cooldown
    if (this.lastTriggered) {
      const cooldownMs = this.config.cooldownMinutes * 60 * 1000;
      const timeSinceLastTrigger = Date.now() - this.lastTriggered.getTime();
      if (timeSinceLastTrigger < cooldownMs) {
        return false;
      }
    }

    // Get recent errors and filter by this pattern
    const recentErrors = this.errorLog.getRecent(50);
    const patternErrors = recentErrors.filter(e => {
      const entryPatternKey = this.extractPatternKey(e.error);
      return entryPatternKey === patternKey;
    });

    // Check threshold for this pattern
    if (patternErrors.length >= this.config.threshold) {
      return true;
    }

    return false;
  }

  /**
   * Extract a pattern key from an error for grouping
   */
  private extractPatternKey(error: ErrorContext): string {
    // Use errorType as the primary pattern identifier
    // Combine with skillName or toolName if available for more specific grouping
    const parts = [error.errorType];
    
    if (error.skillName) {
      parts.push(error.skillName);
    } else if (error.toolName) {
      parts.push(error.toolName);
    }
    
    return parts.join(':');
  }

  /**
   * Fire the trigger
   */
  private async fire(patternKey: string): Promise<void> {
    if (!this.callback) return;

    const now = new Date();
    this.lastTriggered = now;
    this.patternLastTriggered.set(patternKey, now);

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
