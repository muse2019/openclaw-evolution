/**
 * Forbidden Executor (L3)
 * Rejects changes to protected resources
 */

import { RiskLevel, EvolutionProposal, EvolutionResult } from '../types.js';
import { Executor } from './base.js';
import * as fs from 'fs';
import * as path from 'path';

export class ForbiddenExecutor implements Executor {
  private logPath: string;

  constructor(dataDir: string) {
    this.logPath = path.join(dataDir, 'forbidden-attempts.log');
  }

  canHandle(level: RiskLevel): boolean {
    return level === 'L3';
  }

  async execute(proposal: EvolutionProposal): Promise<EvolutionResult> {
    // Log the forbidden attempt
    await this.logForbiddenAttempt(proposal);

    return {
      success: false,
      proposalId: proposal.id,
      action: 'forbidden',
      message: `This change is forbidden: ${proposal.target} is a protected resource`,
      rollbackAvailable: false,
    };
  }

  // ============================================
  // Private methods
  // ============================================

  private async logForbiddenAttempt(proposal: EvolutionProposal): Promise<void> {
    const entry = {
      timestamp: new Date().toISOString(),
      proposalId: proposal.id,
      target: proposal.target,
      change: proposal.change,
      reasoning: proposal.reasoning,
      source: proposal.source,
    };

    const line = JSON.stringify(entry) + '\n';

    const dir = path.dirname(this.logPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.appendFileSync(this.logPath, line);
  }
}
