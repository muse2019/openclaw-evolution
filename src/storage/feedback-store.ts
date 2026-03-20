import * as fs from 'fs';
import * as path from 'path';

export interface FeedbackEntry {
  id: string;
  timestamp: Date;
  message: string;
  sentiment: 'positive' | 'negative' | 'neutral';
  context: {
    skill?: string;
    action?: string;
    sessionId?: string;
  };
}

export class FeedbackStore {
  private filePath: string;
  private entries: FeedbackEntry[] = [];

  constructor(dataDir: string) {
    this.filePath = path.join(dataDir, 'feedback', 'feedback-log.json');
    this.ensureDir();
    this.load();
  }

  private ensureDir(): void {
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  private load(): void {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf-8');
        const data = JSON.parse(raw);
        this.entries = data.entries || [];
      }
    } catch {
      this.entries = [];
    }
  }

  private save(): void {
    fs.writeFileSync(this.filePath, JSON.stringify({ entries: this.entries }, null, 2), 'utf-8');
  }

  async record(
    message: string,
    sentiment: FeedbackEntry['sentiment'],
    context: FeedbackEntry['context'] = {}
  ): Promise<FeedbackEntry> {
    const entry: FeedbackEntry = {
      id: `fb-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      timestamp: new Date(),
      message,
      sentiment,
      context,
    };
    this.entries.unshift(entry);
    this.save();
    return entry;
  }

  getRecent(count: number = 50): FeedbackEntry[] {
    return this.entries.slice(0, count);
  }

  getNegative(count: number = 100): FeedbackEntry[] {
    return this.entries.filter(e => e.sentiment === 'negative').slice(0, count);
  }

  getNegativeCount(sinceTimestamp?: Date): number {
    if (sinceTimestamp) {
      return this.entries.filter(
        e => e.sentiment === 'negative' && new Date(e.timestamp) >= sinceTimestamp
      ).length;
    }
    return this.entries.filter(e => e.sentiment === 'negative').length;
  }
}
