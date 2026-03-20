/**
 * Auto Executor (🟢 Auto)
 * Automatically executes low-risk changes without user confirmation
 * Uses direct fs operations instead of fake API calls
 */

import { RiskLevel, EvolutionProposal, EvolutionResult } from '../types.js';
import { Executor } from './base.js';
import { EvolutionLog } from '../storage/index.js';
import * as fs from 'fs';
import * as path from 'path';

export class AutoExecutor implements Executor {
  private dataDir: string;
  private evolutionLog: EvolutionLog;

  constructor(dataDir: string, evolutionLog: EvolutionLog) {
    this.dataDir = dataDir;
    this.evolutionLog = evolutionLog;
  }

  canHandle(level: RiskLevel): boolean {
    return level === 'auto';
  }

  async execute(proposal: EvolutionProposal): Promise<EvolutionResult> {
    try {
      // Get before state
      const beforeContent = await this.getBeforeContent(proposal);

      // Apply the change
      const afterContent = await this.applyChange(proposal, beforeContent);

      // Record the evolution
      const before = EvolutionLog.createFileSnapshot(proposal.target, beforeContent);
      const after = EvolutionLog.createFileSnapshot(proposal.target, afterContent);

      await this.evolutionLog.record(proposal, before, after);

      return {
        success: true,
        proposalId: proposal.id,
        action: 'executed',
        message: `🟢 Auto-executed: ${proposal.change}`,
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

  private async applyChange(proposal: EvolutionProposal, currentContent: string): Promise<string> {
    const targetPath = this.resolveTargetPath(proposal);
    
    // Apply text improvement based on proposal type
    const updatedContent = this.applyTextImprovement(currentContent, proposal.change);
    
    // Ensure directory exists
    const dir = path.dirname(targetPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    // Write the updated content
    fs.writeFileSync(targetPath, updatedContent, 'utf-8');
    
    return updatedContent;
  }

  private resolveTargetPath(proposal: EvolutionProposal): string {
    // If target is already an absolute path, use it
    if (path.isAbsolute(proposal.target)) {
      return proposal.target;
    }
    
    // Otherwise, resolve relative to home directory
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

  private applyTextImprovement(content: string, change: string): string {
    // Pattern 1: "fix typo 'recieve' -> 'receive'" or "fix typo 'recieve' to 'receive'"
    const fixTypoMatch = change.match(/fix typo\s+['"]([^'"]+)['"]\s*(?:->|to)\s*['"]([^'"]+)['"]/i);
    if (fixTypoMatch) {
      const [, from, to] = fixTypoMatch;
      // Use global replace for the typo
      const regex = new RegExp(from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
      return content.replace(regex, to);
    }

    // Pattern 2: "'old' -> 'new'" or "'old' to 'new'" (general replacement)
    const arrowMatch = change.match(/['"]([^'"]+)['"]\s*(?:->|to)\s*['"]([^'"]+)['"]/i);
    if (arrowMatch) {
      const [, from, to] = arrowMatch;
      const regex = new RegExp(from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
      return content.replace(regex, to);
    }

    // Pattern 3: "clarify X" or "improve X" - append a comment noting the suggestion
    const clarifyMatch = change.match(/(clarify|improve|update|add)\s+(.+)/i);
    if (clarifyMatch) {
      const suggestion = clarifyMatch[2];
      // Append as a comment for human review
      const comment = `\n\n<!-- Evolution suggestion: ${suggestion} -->`;
      return content + comment;
    }

    // Pattern 4: "remove X" or "delete X"
    const removeMatch = change.match(/(remove|delete)\s+['"]([^'"]+)['"]/i);
    if (removeMatch) {
      const [, , target] = removeMatch;
      const regex = new RegExp(target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
      return content.replace(regex, '');
    }

    // No recognized pattern - return unchanged
    return content;
  }
}
