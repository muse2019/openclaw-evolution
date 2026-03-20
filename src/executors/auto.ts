/**
 * Auto Executor (L0)
 * Automatically executes low-risk changes without user confirmation
 */

import { RiskLevel, EvolutionProposal, EvolutionResult, OpenClawAPI } from '../types.js';
import { Executor } from './base.js';
import { EvolutionLog } from '../storage/index.js';

export class AutoExecutor implements Executor {
  private api: OpenClawAPI;
  private evolutionLog: EvolutionLog;

  constructor(api: OpenClawAPI, evolutionLog: EvolutionLog) {
    this.api = api;
    this.evolutionLog = evolutionLog;
  }

  canHandle(level: RiskLevel): boolean {
    return level === 'L0';
  }

  async execute(proposal: EvolutionProposal): Promise<EvolutionResult> {
    try {
      // Get before state
      const beforeContent = await this.getBeforeContent(proposal);

      // Apply the change
      const afterContent = await this.applyChange(proposal);

      // Record the evolution
      const before = EvolutionLog.createFileSnapshot(proposal.target, beforeContent);
      const after = EvolutionLog.createFileSnapshot(proposal.target, afterContent);

      await this.evolutionLog.record(proposal, before, after);

      // Log the action
      this.api.log(`[L0 Auto] Executed: ${proposal.change}`, 'info');

      return {
        success: true,
        proposalId: proposal.id,
        action: 'executed',
        message: `Automatically applied: ${proposal.change}`,
        rollbackAvailable: true,
      };
    } catch (error) {
      return {
        success: false,
        proposalId: proposal.id,
        action: 'executed',
        message: `Failed to execute: ${error instanceof Error ? error.message : 'Unknown error'}`,
        rollbackAvailable: false,
      };
    }
  }

  // ============================================
  // Private methods
  // ============================================

  private async getBeforeContent(proposal: EvolutionProposal): Promise<string> {
    switch (proposal.type) {
      case 'skill':
        return await this.api.getSkill(proposal.target);
      case 'config':
        const configValue = await this.api.getConfig(proposal.target);
        return JSON.stringify(configValue);
      case 'memory':
        const memoryValue = await this.api.getMemory(proposal.target);
        return JSON.stringify(memoryValue);
      default:
        return await this.api.readFile(proposal.target);
    }
  }

  private async applyChange(proposal: EvolutionProposal): Promise<string> {
    // For L0 changes, we apply the improvement directly
    // The actual change logic depends on the type of improvement

    switch (proposal.type) {
      case 'skill': {
        const current = await this.api.getSkill(proposal.target);
        // Apply typo fix or phrasing improvement
        // This would need actual implementation based on proposal.change
        const updated = this.applyTextImprovement(current, proposal.change);
        await this.api.updateSkill(proposal.target, updated);
        return updated;
      }
      default:
        throw new Error(`Unsupported target type for auto-execution: ${proposal.type}`);
    }
  }

  private applyTextImprovement(content: string, change: string): string {
    // This is a placeholder - actual implementation would parse the change
    // and apply specific text improvements
    return content;
  }
}
