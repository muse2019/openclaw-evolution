import { FeedbackStore, FeedbackEntry } from '../storage/index.js';

const NEGATIVE_KEYWORDS = [
  '慢', '不行', '错误', '垃圾', '差', '糟糕', '不对', '不满意',
  '失败', '太久了', '烦', '难用', '没用', '有问题', '崩', '坏',
];

const POSITIVE_KEYWORDS = [
  '好', '不错', '棒', '赞', '对', '满意', '快', '有用', '厉害',
  '完美', '优秀', '感谢',
];

export type Sentiment = 'positive' | 'negative' | 'neutral';

export function detectSentiment(message: string): Sentiment {
  const lower = message.toLowerCase();
  const negScore = NEGATIVE_KEYWORDS.filter(k => lower.includes(k)).length;
  const posScore = POSITIVE_KEYWORDS.filter(k => lower.includes(k)).length;
  
  if (negScore > posScore) return 'negative';
  if (posScore > negScore) return 'positive';
  return 'neutral';
}

export interface FeedbackTriggerConfig {
  feedbackStore: FeedbackStore;
  threshold: number;       // 触发所需负面反馈数，默认 10
  cooldownHours: number;    // 冷却时间（小时），默认 6
}

export class FeedbackTrigger {
  private feedbackStore: FeedbackStore;
  private threshold: number;
  private cooldownHours: number;
  private lastTriggered: Date | null = null;
  private callback?: (entries: FeedbackEntry[]) => Promise<void>;

  constructor(config: FeedbackTriggerConfig) {
    this.feedbackStore = config.feedbackStore;
    this.threshold = config.threshold;
    this.cooldownHours = config.cooldownHours;
  }

  onTrigger(callback: (entries: FeedbackEntry[]) => Promise<void>): void {
    this.callback = callback;
  }

  async check(): Promise<void> {
    if (!this.callback) return;
    if (this.inCooldown()) return;

    const negativeEntries = this.feedbackStore.getNegative(this.threshold);
    
    if (negativeEntries.length >= this.threshold) {
      this.lastTriggered = new Date();
      await this.callback(negativeEntries);
    }
  }

  private inCooldown(): boolean {
    if (!this.lastTriggered) return false;
    const hoursSince = (Date.now() - this.lastTriggered.getTime()) / (1000 * 60 * 60);
    return hoursSince < this.cooldownHours;
  }

  getStatus(): { inCooldown: boolean; negativeCount: number; threshold: number } {
    const negativeCount = this.feedbackStore.getNegativeCount();
    return {
      inCooldown: this.inCooldown(),
      negativeCount,
      threshold: this.threshold,
    };
  }
}
