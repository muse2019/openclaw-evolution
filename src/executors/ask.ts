/**
 * Ask Executor (🟡 Ask)
 * Generates a preview report for user confirmation
 * Instead of blocking for user input, writes to a pending file
 */

import { RiskLevel, EvolutionProposal, EvolutionResult } from '../types.js';
import { Executor } from './base.js';
import { EvolutionLog } from '../storage/index.js';
import * as fs from 'fs';
import * as path from 'path';

export class AskExecutor implements Executor {
  private dataDir: string;
  private evolutionLog: EvolutionLog;
  private pendingDir: string;

  constructor(dataDir: string, evolutionLog: EvolutionLog) {
    this.dataDir = dataDir;
    this.evolutionLog = evolutionLog;
    this.pendingDir = path.join(dataDir, 'pending');
  }

  canHandle(level: RiskLevel): boolean {
    return level === 'ask';
  }

  async execute(proposal: EvolutionProposal): Promise<EvolutionResult> {
    try {
      // Get before state for preview
      const beforeContent = await this.getBeforeContent(proposal);

      // Generate preview of the change
      const preview = this.generatePreview(proposal, beforeContent);

      // Write to pending file for user review
      const pendingFile = await this.writePendingProposal(proposal, preview);

      return {
        success: false, // Not executed yet, waiting for approval
        proposalId: proposal.id,
        action: 'asked',
        message: `🟡 Pending approval: ${proposal.change}\nPreview written to: ${pendingFile}`,
        rollbackAvailable: false,
      };
    } catch (error) {
      return {
        success: false,
        proposalId: proposal.id,
        action: 'asked',
        message: `Failed to create preview: ${error instanceof Error ? error.message : 'Unknown error'}`,
        rollbackAvailable: false,
      };
    }
  }

  /**
   * Execute an approved proposal
   */
  async executeApproved(proposal: EvolutionProposal, beforeContent: string): Promise<EvolutionResult> {
    try {
      const targetPath = this.resolveTargetPath(proposal);
      
      // Apply the change
      const afterContent = await this.applyChange(proposal, beforeContent, targetPath);

      // Record the evolution
      const before = EvolutionLog.createFileSnapshot(proposal.target, beforeContent);
      const after = EvolutionLog.createFileSnapshot(proposal.target, afterContent);

      await this.evolutionLog.record(proposal, before, after);

      return {
        success: true,
        proposalId: proposal.id,
        action: 'executed',
        message: `🟡 Approved and executed: ${proposal.change}`,
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
    const targetPath = this.resolveTargetPath(proposal);
    
    if (fs.existsSync(targetPath)) {
      return fs.readFileSync(targetPath, 'utf-8');
    }
    
    return '';
  }

  private generatePreview(proposal: EvolutionProposal, current: string): string {
    const lines = [
      `# Evolution Proposal (🟡 Ask - Requires Approval)`,
      ``,
      `## Metadata`,
      `- **ID:** ${proposal.id}`,
      `- **Type:** ${proposal.type}`,
      `- **Target:** ${proposal.target}`,
      `- **Generated:** ${proposal.timestamp.toISOString()}`,
      `- **Source:** ${proposal.source}`,
      ``,
      `## Proposed Change`,
      proposal.change,
      ``,
      `## Reasoning`,
      proposal.reasoning,
      ``,
      `## Current Content`,
      '```',
      current.slice(0, 1000) + (current.length > 1000 ? '\n... (truncated)' : ''),
      '```',
      ``,
      `---`,
      ``,
      `To approve this change, reply with:`,
      `\`/evolution approve ${proposal.id}\``,
      ``,
      `To reject this change, reply with:`,
      `\`/evolution reject ${proposal.id}\``,
    ];

    return lines.join('\n');
  }

  private async writePendingProposal(proposal: EvolutionProposal, preview: string): Promise<string> {
    // Ensure pending directory exists
    if (!fs.existsSync(this.pendingDir)) {
      fs.mkdirSync(this.pendingDir, { recursive: true });
    }

    // Write preview file
    const previewFile = path.join(this.pendingDir, `${proposal.id}.md`);
    fs.writeFileSync(previewFile, preview, 'utf-8');

    // Write proposal JSON for later execution
    const proposalFile = path.join(this.pendingDir, `${proposal.id}.json`);
    fs.writeFileSync(proposalFile, JSON.stringify(proposal, null, 2), 'utf-8');

    return previewFile;
  }

  private resolveTargetPath(proposal: EvolutionProposal): string {
    if (path.isAbsolute(proposal.target)) {
      return proposal.target;
    }
    
    const homeDir = process.env.HOME || process.env.USERPROFILE || '';
    
    switch (proposal.type) {
      case 'skill':
        return path.join(homeDir, '.openclaw', 'workspace', 'skills', proposal.target);
      case 'config':
        return path.join(homeDir, '.openclaw', 'config', proposal.target);
      case 'memory':
        return path.join(homeDir, '.openclaw', 'memory', proposal.target);
      default:
        return path.join(homeDir, '.openclaw', proposal.target);
    }
  }

  private async applyChange(proposal: EvolutionProposal, current: string, targetPath: string): Promise<string> {
    // Apply the actual change based on proposal
    // This would need implementation based on proposal.change
    const updatedContent = current; // Placeholder
    
    // Ensure directory exists
    const dir = path.dirname(targetPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    fs.writeFileSync(targetPath, updatedContent, 'utf-8');
    
    return updatedContent;
  }
}
