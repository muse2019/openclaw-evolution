/**
 * Timer Trigger
 * Periodically triggers evolution for scheduled analysis
 */

import { TriggerType } from '../types.js';

export interface TimerTriggerConfig {
  enabled: boolean;
  intervalHours: number;
  runOnStart: boolean;
}

const DEFAULT_CONFIG: TimerTriggerConfig = {
  enabled: true,
  intervalHours: 24,
  runOnStart: false,
};

export type TriggerCallback = (type: TriggerType) => Promise<void>;

export class TimerTrigger {
  private config: TimerTriggerConfig;
  private callback: TriggerCallback | null = null;
  private intervalId: NodeJS.Timeout | null = null;
  private lastRun: Date | null = null;

  constructor(config?: Partial<TimerTriggerConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Set the callback to be called when trigger fires
   */
  onTrigger(callback: TriggerCallback): void {
    this.callback = callback;
  }

  /**
   * Start the timer
   */
  start(): void {
    if (!this.config.enabled || this.intervalId) {
      return;
    }

    // Run on start if configured
    if (this.config.runOnStart && this.callback) {
      this.callback('timer');
    }

    // Set up interval
    const intervalMs = this.config.intervalHours * 60 * 60 * 1000;
    this.intervalId = setInterval(() => {
      this.fire();
    }, intervalMs);
  }

  /**
   * Stop the timer
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  /**
   * Manually trigger now
   */
  async triggerNow(): Promise<void> {
    await this.fire();
  }

  /**
   * Fire the trigger
   */
  private async fire(): Promise<void> {
    if (!this.callback || !this.config.enabled) return;

    this.lastRun = new Date();
    await this.callback('timer');
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<TimerTriggerConfig>): void {
    const wasRunning = this.intervalId !== null;
    this.stop();
    this.config = { ...this.config, ...config };
    if (wasRunning && this.config.enabled) {
      this.start();
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): TimerTriggerConfig {
    return { ...this.config };
  }

  /**
   * Get status
   */
  getStatus(): {
    running: boolean;
    lastRun: Date | null;
    nextRun: Date | null;
  } {
    let nextRun: Date | null = null;
    if (this.lastRun && this.config.enabled) {
      nextRun = new Date(
        this.lastRun.getTime() + this.config.intervalHours * 60 * 60 * 1000
      );
    }

    return {
      running: this.intervalId !== null,
      lastRun: this.lastRun,
      nextRun,
    };
  }
}
