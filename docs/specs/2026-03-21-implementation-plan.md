# OpenClaw 自我进化系统实现计划

**Goal:** 实现三层自我进化系统（错误驱动 + 反馈驱动 + 手动），通过 Claude Code agent 执行真实代码修改

**Architecture:** 在现有 openclaw-evolution 插件基础上，新增 FeedbackStore、FeedbackTrigger、FeedbackAnalyzer、EvolutionExecutor 四个组件，复用现有 ErrorTrigger/TimerTrigger，复用现有 storage 基础设施

**Tech Stack:** TypeScript, Node.js, ACP runtime (claude-code agent)

---

## Chunk 1: 基础设施 — FeedbackStore

**Files:**
- Create: `src/storage/feedback-store.ts`
- Modify: `src/storage/index.ts`（导出 FeedbackStore）
- Test: `src/storage/__tests__/feedback-store.test.ts`

---

### Task 1: 创建 FeedbackStore

**Files:**
- Create: `src/storage/feedback-store.ts`

- [ ] **Step 1: 创建 feedback-store.ts**

```typescript
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
```

- [ ] **Step 2: 更新 src/storage/index.ts 导出 FeedbackStore**

```typescript
export { ErrorLog } from './error-log.js';
export { EvolutionLog } from './evolution-log.js';
export { MetricsStore } from './metrics.js';
export { FeedbackStore } from './feedback-store.js';  // 新增
```

- [ ] **Step 3: 提交**

```bash
git add src/storage/feedback-store.ts src/storage/index.ts
git commit -m "feat: add FeedbackStore for user feedback persistence"
```

---

## Chunk 2: 情感判断 — FeedbackTrigger

**Files:**
- Create: `src/triggers/feedback-trigger.ts`
- Modify: `src/triggers/index.ts`（导出 FeedbackTrigger）
- Test: `src/triggers/__tests__/feedback-trigger.test.ts`

---

### Task 2: 创建 FeedbackTrigger

**Files:**
- Create: `src/triggers/feedback-trigger.ts`

- [ ] **Step 1: 创建 feedback-trigger.ts**

```typescript
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
```

- [ ] **Step 2: 更新 src/triggers/index.ts**

```typescript
export { ErrorTrigger } from './error-trigger.js';
export { TimerTrigger } from './timer-trigger.js';
export { ManualTrigger } from './manual-trigger.js';
export { FeedbackTrigger, detectSentiment } from './feedback-trigger.js';  // 新增
```

- [ ] **Step 3: 提交**

```bash
git add src/triggers/feedback-trigger.ts src/triggers/index.ts
git commit -m "feat: add FeedbackTrigger with sentiment detection"
```

---

## Chunk 3: Agent 执行器 — EvolutionExecutor

**Files:**
- Create: `src/executors/evolution-executor.ts`
- Modify: `src/executors/index.ts`（导出 EvolutionExecutor）
- Modify: `src/types.ts`（新增 AgentExecutionResult 类型）

---

### Task 3: 创建 EvolutionExecutor

**Files:**
- Create: `src/executors/evolution-executor.ts`

- [ ] **Step 1: 创建 evolution-executor.ts**

```typescript
import * as path from 'path';
import * as fs from 'fs';
import { sessions_spawn } from '../utils/sessions.js';

export interface AgentExecutionResult {
  success: boolean;
  output: string;
  error?: string;
  attempts: number;
}

export interface EvolutionExecutorConfig {
  workspaceDir: string;
  allowedPaths: string[];    // glob patterns
  blockedPaths: string[];   // glob patterns
  maxRetries: number;        // 默认 3
  buildCommand: string;       // 默认 'npm run build'
  testCommand?: string;      // 可选
}

export class EvolutionExecutor {
  private workspaceDir: string;
  private allowedPaths: string[];
  private blockedPaths: string[];
  private maxRetries: number;
  private buildCommand: string;
  private testCommand?: string;

  constructor(config: EvolutionExecutorConfig) {
    this.workspaceDir = config.workspaceDir;
    this.allowedPaths = config.allowedPaths;
    this.blockedPaths = config.blockedPaths;
    this.maxRetries = config.maxRetries;
    this.buildCommand = config.buildCommand;
    this.testCommand = config.testCommand;
  }

  /**
   * Spawn a Claude Code agent to fix an error
   */
  async executeErrorFix(params: {
    errorMessage: string;
    errorType: string;
    filePath?: string;
    skillName?: string;
    relatedFiles?: string[];
  }): Promise<AgentExecutionResult> {
    const contextFiles = await this.gatherContext(params);
    const task = this.buildErrorFixTask(params, contextFiles);
    return this.spawnAgent(task, 'error');
  }

  /**
   * Spawn a Claude Code agent to improve based on feedback
   */
  async executeFeedbackImprovement(params: {
    negativeFeedback: string[];
    targetSkill?: string;
  }): Promise<AgentExecutionResult> {
    const task = this.buildFeedbackTask(params);
    return this.spawnAgent(task, 'feedback');
  }

  private async spawnAgent(task: string, type: 'error' | 'feedback'): Promise<AgentExecutionResult> {
    let lastError = '';
    
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const result = await sessions_spawn({
          task,
          runtime: 'acp',
          agentId: 'claude-code',
          mode: 'run',
          timeoutSeconds: 300,
        });

        // 验证 build
        const buildOk = await this.runVerification();
        if (!buildOk) {
          lastError = 'Build verification failed';
          continue;
        }

        return {
          success: true,
          output: typeof result === 'string' ? result : JSON.stringify(result),
          attempts: attempt,
        };
      } catch (e) {
        lastError = String(e);
      }

      // 指数退避
      if (attempt < this.maxRetries) {
        const delayMs = [5, 15, 45][attempt - 1] * 60 * 1000;
        await this.sleep(delayMs);
      }
    }

    return {
      success: false,
      output: '',
      error: lastError,
      attempts: this.maxRetries,
    };
  }

  private async runVerification(): Promise<boolean> {
    const { execCommand } = await import('../utils/exec.js');
    try {
      const result = await execCommand(this.buildCommand, { cwd: this.workspaceDir, timeoutMs: 60000 });
      return result.exitCode === 0;
    } catch {
      return false;
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private async gatherContext(params: {
    filePath?: string;
    relatedFiles?: string[];
    skillName?: string;
  } }): Promise<Record<string, string>> {
    const context: Record<string, string> = {};

    if (params.filePath && this.isAllowed(params.filePath)) {
      try {
        context[params.filePath] = fs.readFileSync(
          path.join(this.workspaceDir, params.filePath),
          'utf-8'
        );
      } catch { /* ignore */ }
    }

    if (params.relatedFiles) {
      for (const f of params.relatedFiles) {
        if (this.isAllowed(f)) {
          try {
            context[f] = fs.readFileSync(
              path.join(this.workspaceDir, f),
              'utf-8'
            );
          } catch { /* ignore */ }
        }
      }
    }

    return context;
  }

  private isAllowed(filePath: string): boolean {
    // 检查是否在白名单
    for (const pattern of this.allowedPaths) {
      if (this.matchGlob(filePath, pattern)) return true;
    }
    // 检查是否在黑名单
    for (const pattern of this.blockedPaths) {
      if (this.matchGlob(filePath, pattern)) return false;
    }
    return false;
  }

  private matchGlob(filePath: string, pattern: string): boolean {
    // 简化版 glob 匹配，支持 ** 和 *
    const regex = pattern
      .replace(/\./g, '\\.')
      .replace(/\*\*/g, '.*')
      .replace(/\*/g, '[^/]*')
      .replace(/\?/g, '.');
    return new RegExp(`^${regex}$`).test(filePath);
  }

  private buildErrorFixTask(params: {
    errorMessage: string;
    errorType: string;
    filePath?: string;
    skillName?: string;
  }, contextFiles: Record<string, string>): string {
    const contextStr = Object.entries(contextFiles)
      .map(([f, c]) => `=== ${f} ===\n${c}`)
      .join('\n\n');

    return `Analyze and fix the following error.

Error Type: ${params.errorType}
Error Message: ${params.errorMessage}
${params.filePath ? `File: ${params.filePath}` : ''}
${params.skillName ? `Skill: ${params.skillName}` : ''}

${contextStr ? `Context files:\n${contextStr}` : ''}

Your task:
1. Analyze the error root cause
2. Generate a fix as a git-style diff (--- a/file.js +++ b/file.js)
3. Apply the fix to the file
4. Run \`npm run build\` to verify
5. If build passes, apply the changes permanently
6. Report what you fixed and the verification result

Only modify files under ~/.openclaw/workspace/. Do NOT modify auth/, secrets/, .env, or *.pem files.`;
  }

  private buildFeedbackTask(params: {
    negativeFeedback: string[];
    targetSkill?: string;
  }): string {
    return `Analyze the following negative user feedback and improve the relevant skill or code.

Negative feedback:
${params.negativeFeedback.map((f, i) => `${i + 1}. "${f}"`).join('\n')}
${params.targetSkill ? `Target skill: ${params.targetSkill}` : ''}

Your task:
1. Identify patterns in the feedback (e.g., "too slow", "wrong format", "missing info")
2. Find the relevant skill file(s) or code
3. Generate improvements as git-style diffs
4. Apply improvements
5. Run \`npm run build\` to verify
6. Report what you changed and why

Only modify files under ~/.openclaw/workspace/. Do NOT modify auth/, secrets/, .env, or *.pem files.`;
  }
}
```

- [ ] **Step 2: 更新 src/executors/index.ts**

```typescript
export { AutoExecutor } from './auto.js';
export { AskExecutor } from './ask.js';
export { ForbiddenExecutor } from './forbidden.js';
export { EvolutionExecutor } from './evolution-executor.js';  // 新增
```

- [ ] **Step 3: 提交**

```bash
git add src/executors/evolution-executor.ts src/executors/index.ts
git commit -m "feat: add EvolutionExecutor for Claude Code agent spawning"
```

---

## Chunk 4: 反馈分析器 — FeedbackAnalyzer

**Files:**
- Create: `src/analyzers/feedback.ts`
- Modify: `src/analyzers/index.ts`（导出 FeedbackAnalyzer）

---

### Task 4: 创建 FeedbackAnalyzer

**Files:**
- Create: `src/analyzers/feedback.ts`

- [ ] **Step 1: 创建 feedback.ts**

```typescript
import { FeedbackEntry } from '../storage/index.js';

export interface FeedbackInsight {
  pattern: string;
  count: number;
  examples: string[];
  suggestedAction: string;
}

export interface FeedbackAnalysisResult {
  insights: FeedbackInsight[];
  dominantTopics: string[];
  recommendedSkills: string[];
}

export class FeedbackAnalyzer {
  analyze(entries: FeedbackEntry[]): FeedbackAnalysisResult {
    // 按 skill 分组
    const bySkill = this.groupBySkill(entries);
    // 识别模式
    const insights = this.extractPatterns(entries);
    // 提取高频 topic
    const dominantTopics = this.extractTopics(entries);
    // 推荐改进的 skill
    const recommendedSkills = this.extractSkillRecommendations(bySkill);

    return {
      insights,
      dominantTopics,
      recommendedSkills,
    };
  }

  private groupBySkill(entries: FeedbackEntry[]): Map<string, FeedbackEntry[]> {
    const map = new Map<string, FeedbackEntry[]>();
    for (const entry of entries) {
      const skill = entry.context.skill || 'unknown';
      if (!map.has(skill)) map.set(skill, []);
      map.get(skill)!.push(entry);
    }
    return map;
  }

  private extractPatterns(entries: FeedbackEntry[]): FeedbackInsight[] {
    const insights: FeedbackInsight[] = [];
    const patternMap = new Map<string, FeedbackEntry[]>();

    for (const entry of entries) {
      const msg = entry.message.toLowerCase();
      let pattern = 'general';
      
      if (msg.includes('慢') || msg.includes('久')) pattern = 'too_slow';
      else if (msg.includes('错') || msg.includes('不对')) pattern = 'incorrect';
      else if (msg.includes('不') || msg.includes('没') || msg.includes('无')) pattern = 'missing';
      else if (msg.includes('崩') || msg.includes('坏')) pattern = 'broken';
      else if (msg.includes('难') || msg.includes('不懂')) pattern = 'unclear';

      if (!patternMap.has(pattern)) patternMap.set(pattern, []);
      patternMap.get(pattern)!.push(entry);
    }

    const patternLabels: Record<string, string> = {
      too_slow: 'Response too slow',
      incorrect: 'Incorrect response',
      missing: 'Missing information',
      broken: 'Crashes or errors',
      unclear: 'Unclear or confusing',
      general: 'General complaint',
    };

    const patternActions: Record<string, string> = {
      too_slow: 'Optimize the skill instructions for faster execution',
      incorrect: 'Review and fix the logic in the skill',
      missing: 'Add missing information or capabilities to the skill',
      broken: 'Fix the error handling and edge cases',
      unclear: 'Improve clarity and specificity of instructions',
      general: 'Review the overall approach and quality',
    };

    for (const [pattern, entries] of patternMap) {
      insights.push({
        pattern,
        count: entries.length,
        examples: entries.slice(0, 3).map(e => e.message),
        suggestedAction: patternActions[pattern] || patternActions.general,
      });
    }

    return insights.sort((a, b) => b.count - a.count);
  }

  private extractTopics(entries: FeedbackEntry[]): string[] {
    const wordCounts = new Map<string, number>();
    const stopWords = new Set(['的', '了', '是', '在', '我', '你', '他', '这', '那', '和', '也', '都', '有', '没有', '不']);

    for (const entry of entries) {
      const words = entry.message.replace(/[^\w\s]/g, '').split(/\s+/);
      for (const word of words) {
        if (word.length >= 2 && !stopWords.has(word)) {
          wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
        }
      }
    }

    return Array.from(wordCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([word]) => word);
  }

  private extractSkillRecommendations(
    bySkill: Map<string, FeedbackEntry[]>
  ): string[] {
    return Array.from(bySkill.entries())
      .filter(([skill, entries]) => skill !== 'unknown' && entries.length >= 2)
      .sort((a, b) => b[1].length - a[1].length)
      .slice(0, 3)
      .map(([skill]) => skill);
  }
}
```

- [ ] **Step 2: 更新 src/analyzers/index.ts**

```typescript
export { RootCauseAnalyzer } from './root-cause.js';
export { FrameworkAnalyzer } from './framework.js';
export { MetricsAnalyzer } from './metrics.js';
export { FeedbackAnalyzer } from './feedback.js';  // 新增
```

- [ ] **Step 3: 提交**

```bash
git add src/analyzers/feedback.ts src/analyzers/index.ts
git commit -m "feat: add FeedbackAnalyzer for feedback pattern analysis"
```

---

## Chunk 5: 引擎集成 — Engine 修改

**Files:**
- Modify: `src/engine.ts`（新增 EvolutionExecutor 集成 + FeedbackTrigger）
- Modify: `src/types.ts`（新增 FeedbackTriggerConfig）

---

### Task 5: 修改 Engine 集成新组件

- [ ] **Step 1: 更新 types.ts 添加 FeedbackTriggerConfig**

在 `EvolutionConfig` 中添加：
```typescript
feedbackThreshold?: number;    // 默认 10
feedbackCooldownHours?: number; // 默认 6
```

- [ ] **Step 2: 修改 engine.ts 添加 EvolutionExecutor 和 FeedbackTrigger**

在 `EvolutionEngine` 构造函数中初始化：
```typescript
// 新增 EvolutionExecutor
const executorConfig = {
  workspaceDir: engineConfig.workspaceDir,
  allowedPaths: config.paths.allowlist,
  blockedPaths: config.paths.blocklist,
  maxRetries: 3,
  buildCommand: 'npm run build',
};
this.evolutionExecutor = new EvolutionExecutor(executorConfig);

// 新增 FeedbackTrigger
const feedbackTriggerConfig = {
  feedbackStore: this.errorLog as unknown as FeedbackStore, // 复用错误日志的数据目录
  threshold: config.feedbackThreshold ?? 10,
  cooldownHours: config.feedbackCooldownHours ?? 6,
};
this.feedbackTrigger = new FeedbackTrigger(feedbackTriggerConfig);

// 订阅反馈触发
this.feedbackTrigger.onTrigger(async (entries) => {
  const analyzer = new FeedbackAnalyzer();
  const analysis = analyzer.analyze(entries);
  await this.runFeedbackEvolution(analysis);
});
```

新增方法：
```typescript
private async runFeedbackEvolution(analysis: FeedbackAnalysisResult): Promise<void> {
  for (const insight of analysis.insights) {
    const result = await this.evolutionExecutor.executeFeedbackImprovement({
      negativeFeedback: insight.examples,
      targetSkill: insight.pattern,
    });
    // 记录结果
  }
}
```

- [ ] **Step 3: 在 engine.start() 中启动反馈检查定时器**

```typescript
// 定期检查反馈阈值
setInterval(() => {
  this.feedbackTrigger.check();
}, 60 * 60 * 1000); // 每小时检查一次
```

- [ ] **Step 4: 提交**

```bash
git add src/engine.ts src/types.ts
git commit -m "feat: integrate EvolutionExecutor and FeedbackTrigger into engine"
```

---

## Chunk 6: 插件入口 — index.ts 修改

**Files:**
- Modify: `src/index.ts`（注册新命令 + 反馈收集 hook）
- Modify: `openclaw.plugin.json`（新增 config schema）

---

### Task 6: 修改 index.ts

- [ ] **Step 1: 注册新命令**

在 `register()` 函数中新增：

```typescript
// /feedback-evolve 命令
api.registerCommand({
  name: 'feedback_evolve',
  description: 'Run feedback-driven evolution',
  acceptsArgs: false,
  handler: async (): Promise<ReplyPayload> => {
    if (!engine) return reply('❌ Evolution engine not initialized');
    const trigger = (engine as any).feedbackTrigger;
    await trigger.check();
    return reply('✅ Feedback-driven evolution check triggered');
  },
});

// /feedback 命令（收集反馈）
api.registerCommand({
  name: 'feedback',
  description: 'Submit feedback about the assistant',
  acceptsArgs: true,
  handler: async (ctx: PluginCommandContext): Promise<ReplyPayload> => {
    if (!engine) return reply('❌ Evolution engine not initialized');
    const message = ctx.commandBody.trim();
    const { detectSentiment } = await import('./triggers/feedback-trigger.js');
    const sentiment = detectSentiment(message);
    const store = (engine as any).feedbackStore;
    await store.record(message, sentiment, {});
    return reply(`📝 Feedback recorded (${sentiment}). Thank you!`);
  },
});
```

- [ ] **Step 2: 注册反馈收集 hook（在 after_tool_call 中）**

```typescript
api.registerHook('after_tool_call', async (event: unknown) => {
  // 错误收集（已有）
  const ctx = event as Record<string, unknown>;
  if (ctx.error && engine) {
    const errorContext: ErrorContext = {
      timestamp: new Date(),
      errorMessage: String(ctx.error),
      errorType: (ctx.error as Error)?.name || 'Error',
      toolName: String(ctx.toolName || 'unknown'),
    };
    await (engine as any).errorLog.recordError(errorContext);
  }

  // 自然语言反馈收集（新增）
  // 从 ctx.result 中尝试提取用户满意度信号（如果有）
  // 注意：这里只能记录结构化的 context，实际 feedback 由用户通过 /feedback 命令提供
});
```

- [ ] **Step 3: 更新 openclaw.plugin.json**

```json
{
  "id": "openclaw-evolution",
  "name": "OpenClaw Evolution",
  "description": "Self-evolution plugin - learns from errors and improves itself",
  "version": "0.2.0",
  "skills": ["./skills/evolve"],
  "configSchema": {
    "type": "object",
    "additionalProperties": false,
    "properties": {
      "evolutionEnabled": { "type": "boolean", "default": true },
      "errorThreshold": { "type": "number", "default": 3 },
      "cooldownMinutes": { "type": "number", "default": 30 },
      "feedbackThreshold": { "type": "number", "default": 10 },
      "feedbackCooldownHours": { "type": "number", "default": 6 },
      "maxRetries": { "type": "number", "default": 3 }
    }
  }
}
```

- [ ] **Step 4: 提交**

```bash
git add src/index.ts openclaw.plugin.json
git commit -m "feat: register /feedback and /feedback_evolve commands, add feedback hook"
```

---

## Chunk 7: 构建验证

**Files:**
- Modify: `package.json`（确保 build 脚本正确）
- Run: `npm run build`

---

### Task 7: 端到端构建

- [ ] **Step 1: 运行构建**

```bash
npm run build
```

预期：退出码 0，无 TypeScript 错误

- [ ] **Step 2: 提交**

```bash
git add -A
git commit -m "feat: complete 3-layer self-evolution system implementation"
```

---

## 总结

| Chunk | 组件 | 文件数 |
|-------|------|--------|
| 1 | FeedbackStore | 2 |
| 2 | FeedbackTrigger | 2 |
| 3 | EvolutionExecutor | 2 |
| 4 | FeedbackAnalyzer | 2 |
| 5 | Engine 集成 | 2 |
| 6 | index.ts 修改 | 2 |
| 7 | 构建验证 | 1 |
