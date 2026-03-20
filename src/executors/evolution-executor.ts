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
  }): Promise<Record<string, string>> {
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
