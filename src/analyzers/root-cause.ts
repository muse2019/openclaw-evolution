/**
 * Root Cause Analyzer
 * Analyzes errors to identify underlying causes
 */

import { ErrorContext, ErrorPattern, EvolutionProposal, AnalysisResult } from '../types.js';
import { ErrorLog } from '../storage/index.js';

export class RootCauseAnalyzer {
  private errorLog: ErrorLog;

  constructor(errorLog: ErrorLog) {
    this.errorLog = errorLog;
  }

  /**
   * Analyze recent errors and generate proposals
   */
  async analyze(): Promise<AnalysisResult> {
    const recentErrors = this.errorLog.getRecent(50);
    const unresolved = recentErrors.filter(e => !e.resolved);

    if (unresolved.length === 0) {
      return {
        proposals: [],
        patterns: [],
        insights: ['No unresolved errors to analyze'],
        confidence: 1,
      };
    }

    // Detect patterns
    const patterns = this.detectPatterns(unresolved.map(e => e.error));

    // Generate proposals based on patterns
    const proposals = this.generateProposals(patterns);

    // Generate insights
    const insights = this.generateInsights(patterns, unresolved.length);

    return {
      proposals,
      patterns,
      insights,
      confidence: Math.min(0.9, unresolved.length / 10),
    };
  }

  /**
   * Analyze a single error
   */
  analyzeSingle(error: ErrorContext): EvolutionProposal | null {
    const pattern = this.identifyErrorType(error);
    if (!pattern) return null;

    return this.createProposalForError(error, pattern);
  }

  // ============================================
  // Private methods
  // ============================================

  private detectPatterns(errors: ErrorContext[]): ErrorPattern[] {
    const patterns: Map<string, ErrorPattern> = new Map();

    for (const error of errors) {
      const key = this.getErrorSignature(error);

      if (!patterns.has(key)) {
        patterns.set(key, {
          pattern: key,
          occurrences: 1,
          firstSeen: error.timestamp,
          lastSeen: error.timestamp,
          examples: [error.errorMessage],
        });
      } else {
        const existing = patterns.get(key)!;
        existing.occurrences++;
        existing.lastSeen = error.timestamp;
        if (existing.examples.length < 3) {
          existing.examples.push(error.errorMessage);
        }
      }
    }

    // Sort by occurrences and return top patterns
    return Array.from(patterns.values())
      .sort((a, b) => b.occurrences - a.occurrences)
      .slice(0, 10);
  }

  private getErrorSignature(error: ErrorContext): string {
    // Normalize error message to detect patterns
    let signature = error.errorType;

    // Add skill name if available
    if (error.skillName) {
      signature += `:${error.skillName}`;
    }

    // Add error category
    if (error.errorMessage.includes('not found') || error.errorMessage.includes('does not exist')) {
      signature += ':not_found';
    } else if (error.errorMessage.includes('permission') || error.errorMessage.includes('denied')) {
      signature += ':permission';
    } else if (error.errorMessage.includes('timeout')) {
      signature += ':timeout';
    } else if (error.errorMessage.includes('parse') || error.errorMessage.includes('syntax')) {
      signature += ':parse_error';
    } else if (error.errorMessage.includes('validation') || error.errorMessage.includes('invalid')) {
      signature += ':validation';
    }

    return signature;
  }

  private identifyErrorType(error: ErrorContext): string | null {
    const msg = error.errorMessage.toLowerCase();

    if (msg.includes('not found') || msg.includes('does not exist')) {
      return 'missing_resource';
    }
    if (msg.includes('permission') || msg.includes('denied')) {
      return 'permission';
    }
    if (msg.includes('timeout')) {
      return 'timeout';
    }
    if (msg.includes('parse') || msg.includes('syntax') || msg.includes('invalid json')) {
      return 'parse_error';
    }
    if (msg.includes('validation') || msg.includes('invalid')) {
      return 'validation';
    }
    if (msg.includes('not implemented') || msg.includes('unsupported')) {
      return 'missing_capability';
    }
    if (msg.includes('ambiguous') || msg.includes('unclear')) {
      return 'ambiguous_instruction';
    }
    if (msg.includes('wrong') || msg.includes('incorrect')) {
      return 'wrong_result';
    }

    return null;
  }

  private generateProposals(patterns: ErrorPattern[]): EvolutionProposal[] {
    const proposals: EvolutionProposal[] = [];

    for (const pattern of patterns) {
      // Only create proposals for patterns with multiple occurrences
      if (pattern.occurrences < 2) continue;

      const proposal = this.createProposalForPattern(pattern);
      if (proposal) {
        proposals.push(proposal);
      }
    }

    return proposals;
  }

  private createProposalForPattern(pattern: ErrorPattern): EvolutionProposal | null {
    const id = `evo-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Extract skill name from pattern if present (format: "errorType:skillName:category")
    const patternParts = pattern.pattern.split(':');
    const skillName = patternParts.length > 1 ? patternParts[1] : null;
    
    // Determine target path based on available context
    let target = 'SKILL.md'; // fallback
    if (skillName && skillName !== 'undefined') {
      target = `skills/${skillName}/SKILL.md`;
    }

    // Generate proposal based on pattern type
    if (pattern.pattern.includes('ambiguous_instruction')) {
      return {
        id,
        timestamp: new Date(),
        type: 'skill',
        target,
        change: 'Clarify instructions to reduce ambiguity',
        reasoning: `Pattern "${pattern.pattern}" occurred ${pattern.occurrences} times. Examples: ${pattern.examples.join('; ')}`,
        status: 'pending',
        source: 'error',
      };
    }

    if (pattern.pattern.includes('missing_capability')) {
      return {
        id,
        timestamp: new Date(),
        type: 'skill',
        target,
        change: 'Add missing capability or skill',
        reasoning: `Pattern "${pattern.pattern}" suggests a capability gap. Occurred ${pattern.occurrences} times.`,
        status: 'pending',
        source: 'error',
      };
    }

    if (pattern.pattern.includes('validation')) {
      return {
        id,
        timestamp: new Date(),
        type: 'skill',
        target,
        change: 'Improve input validation in skill',
        reasoning: `Validation errors occurred ${pattern.occurrences} times. Need better validation logic.`,
        status: 'pending',
        source: 'error',
      };
    }

    return null;
  }

  private createProposalForError(error: ErrorContext, pattern: string): EvolutionProposal {
    const id = `evo-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Determine target path based on available context
    let target = 'SKILL.md'; // fallback
    
    if (error.toolName) {
      // If toolName is available, target the tool's source file
      target = `src/tools/${error.toolName}.ts`;
    } else if (error.skillName) {
      // If skillName is available, target the skill directory
      target = `skills/${error.skillName}/SKILL.md`;
    }

    return {
      id,
      timestamp: new Date(),
      type: 'skill',
      target,
      change: `Fix ${pattern.replace('_', ' ')} issue`,
      reasoning: `Error: ${error.errorMessage}`,
      status: 'pending',
      source: 'error',
      errorContext: error,
    };
  }

  private generateInsights(patterns: ErrorPattern[], errorCount: number): string[] {
    const insights: string[] = [];

    insights.push(`Analyzed ${errorCount} unresolved errors`);

    if (patterns.length > 0) {
      const topPattern = patterns[0];
      insights.push(
        `Most common pattern: "${topPattern.pattern}" (${topPattern.occurrences} occurrences)`
      );
    }

    // Check for skill-specific issues
    const skillPatterns = patterns.filter(p => p.pattern.includes(':'));
    if (skillPatterns.length > 3) {
      insights.push('Multiple skills have issues - consider framework-level improvement');
    }

    return insights;
  }
}
