/**
 * Ask Executor (L1)
 * Shows preview and asks user for confirmation before executing
 */

import { RiskLevel, EvolutionProposal, EvolutionResult, OpenClawAPI } from '../types.js';
import { Executor } from './base.js';
import { EvolutionLog } from '../storage/index.js';

export class AskExecutor implements Executor {
  private api: OpenClawAPI;
  private evolutionLog: EvolutionLog;

  constructor(api: OpenClawAPI, evolutionLog: EvolutionLog) {
    this.api = api;
    this.evolutionLog = evolutionLog;
  }

  canHandle(level: RiskLevel): boolean {
    return level === 'L1';
  }

  async execute(proposal: EvolutionProposal): Promise<EvolutionResult> {
    try {
      // Get before state for preview
      const beforeContent = await this.getBeforeContent(proposal);

      // Generate preview of the change
      const preview = await this.generatePreview(proposal, beforeContent);

      // Ask user for confirmation
      const options = [
        'Approve - apply this change',
        'Reject - skip this change',
        'Modify - adjust the proposal',
      ];

      const response = await this.api.askUser(
        this.formatQuestion(proposal, preview),
        options
      );

      if (response === options[0]) {
        // Approved - execute
        return await this.executeApproved(proposal, beforeContent);
      } else if (response === options[2]) {
        // Modify - get new input
        return await this.handleModify(proposal);
      } else {
        // Rejected
        return {
          success: false,
          proposalId: proposal.id,
          action: 'asked',
          message: 'User rejected the change',
          rollbackAvailable: false,
        };
      }
    } catch (error) {
      return {
        success: false,
        proposalId: proposal.id,
        action: 'asked',
        message: `Failed to process: ${error instanceof Error ? error.message : 'Unknown error'}`,
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
        return JSON.stringify(configValue, null, 2);
      case 'memory':
        const memoryValue = await this.api.getMemory(proposal.target);
        return JSON.stringify(memoryValue, null, 2);
      default:
        return await this.api.readFile(proposal.target);
    }
  }

  private async generatePreview(proposal: EvolutionProposal, current: string): Promise<string> {
    // Generate a preview of what the change would look like
    return `
## Proposed Change
**Target:** ${proposal.target}
**Type:** ${proposal.type}

**Reasoning:**
${proposal.reasoning}

**Change:**
${proposal.change}

## Current Content
\`\`\`
${current.slice(0, 500)}${current.length > 500 ? '...' : ''}
\`\`\`
`;
  }

  private formatQuestion(proposal: EvolutionProposal, preview: string): string {
    return `
## Evolution Proposal (L1 - Requires Approval)

${preview}

Do you want to apply this change?
`;
  }

  private async executeApproved(proposal: EvolutionProposal, beforeContent: string): Promise<EvolutionResult> {
    try {
      // Apply the change
      const afterContent = await this.applyChange(proposal, beforeContent);

      // Record the evolution
      const before = EvolutionLog.createFileSnapshot(proposal.target, beforeContent);
      const after = EvolutionLog.createFileSnapshot(proposal.target, afterContent);

      await this.evolutionLog.record(proposal, before, after);

      this.api.log(`[L1 Ask] User approved and executed: ${proposal.change}`, 'info');

      return {
        success: true,
        proposalId: proposal.id,
        action: 'executed',
        message: `Applied with user approval: ${proposal.change}`,
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

  private async handleModify(proposal: EvolutionProposal): Promise<EvolutionResult> {
    const newChange = await this.api.askUser(
      'Please provide the modified change description:',
      ['Cancel'] // Placeholder - would need free text input
    );

    if (newChange === 'Cancel') {
      return {
        success: false,
        proposalId: proposal.id,
        action: 'asked',
        message: 'User cancelled modification',
        rollbackAvailable: false,
      };
    }

    // Would need to re-process with the new change
    return {
      success: false,
      proposalId: proposal.id,
      action: 'asked',
      message: 'Modification requested - needs re-processing',
      rollbackAvailable: false,
    };
  }

  private async applyChange(proposal: EvolutionProposal, current: string): Promise<string> {
    switch (proposal.type) {
      case 'skill': {
        // Apply the actual change
        // This would need implementation based on proposal.change
        await this.api.updateSkill(proposal.target, current);
        return current;
      }
      case 'config': {
        // Parse and apply config change
        await this.api.setConfig(proposal.target, proposal.change);
        return proposal.change;
      }
      case 'memory': {
        await this.api.setMemory(proposal.target, proposal.change);
        return proposal.change;
      }
      default:
        throw new Error(`Unsupported target type: ${proposal.type}`);
    }
  }
}
