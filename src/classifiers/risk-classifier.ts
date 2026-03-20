/**
 * Risk Classifier
 * Determines the risk level of an evolution proposal
 */

import { RiskLevel, EvolutionProposal, ClassificationRule } from '../types.js';

// Default classification rules
const DEFAULT_RULES: ClassificationRule[] = [
  // 🔴 Forbid - Security sensitive (never auto-execute)
  {
    id: 'api-keys',
    pattern: /api[_-]?key|apikey|api_secret/i,
    level: 'forbid',
    reason: 'Contains API key reference',
  },
  {
    id: 'secrets',
    pattern: /secret|password|passwd|pwd/i,
    level: 'forbid',
    reason: 'Contains secret/password reference',
  },
  {
    id: 'tokens',
    pattern: /token|auth[_-]?key|private[_-]?key/i,
    level: 'forbid',
    reason: 'Contains token or private key reference',
  },
  {
    id: 'env-files',
    pattern: /\.env|credentials\.json|secrets\.json/i,
    level: 'forbid',
    reason: 'Sensitive configuration file',
  },
  {
    id: 'auth-directory',
    pattern: /\/auth\/|\/secrets\/|\/\.credentials\//i,
    level: 'forbid',
    reason: 'Protected directory',
  },

  // 🔴 Forbid - High risk (report only, never auto-execute)
  {
    id: 'delete-skill',
    pattern: /delete.*skill|remove.*skill|remove.*capability/i,
    level: 'forbid',
    reason: 'Deleting skills is high risk - report only',
  },
  {
    id: 'core-behavior',
    pattern: /change.*core|modify.*behavior|alter.*fundamental/i,
    level: 'forbid',
    reason: 'Core behavior changes need careful review',
  },
  {
    id: 'safety-removal',
    pattern: /remove.*safety|disable.*check|skip.*validation/i,
    level: 'forbid',
    reason: 'Safety mechanism modification',
  },
  {
    id: 'framework-structure',
    pattern: /restructure.*framework|redesign.*architecture/i,
    level: 'forbid',
    reason: 'Framework restructuring is high impact',
  },

  // 🟡 Ask user - Medium risk (require confirmation)
  {
    id: 'create-skill',
    pattern: /create.*skill|add.*skill|new.*skill/i,
    level: 'ask',
    reason: 'Creating new skills requires user approval',
  },
  {
    id: 'add-tool',
    pattern: /add.*tool|create.*tool|new.*tool/i,
    level: 'ask',
    reason: 'Adding tools requires user approval',
  },
  {
    id: 'modify-instruction',
    pattern: /modify.*instruction|update.*instruction|change.*instruction/i,
    level: 'ask',
    reason: 'Instruction changes require user approval',
  },
  {
    id: 'config-change',
    pattern: /update.*config|change.*config|modify.*config/i,
    level: 'ask',
    reason: 'Configuration changes require user approval',
  },
  {
    id: 'memory-update',
    pattern: /update.*memory|modify.*memory|change.*habit/i,
    level: 'ask',
    reason: 'Memory updates require user approval',
  },

  // 🟢 Auto - Low risk (execute directly)
  {
    id: 'typo-fix',
    pattern: /fix.*typo|correct.*spelling|typo.*correction/i,
    level: 'auto',
    reason: 'Typo fixes are safe',
  },
  {
    id: 'phrasing-improve',
    pattern: /improve.*phrasing|clarify.*instruction|better.*wording/i,
    level: 'auto',
    reason: 'Phrasing improvements are safe',
  },
  {
    id: 'format-fix',
    pattern: /fix.*format|correct.*format|formatting.*fix/i,
    level: 'auto',
    reason: 'Format fixes are safe',
  },
  {
    id: 'error-message',
    pattern: /improve.*error.*message|clarify.*error|better.*error/i,
    level: 'auto',
    reason: 'Error message improvements are safe',
  },
];

export class RiskClassifier {
  private rules: ClassificationRule[];
  private customRules: ClassificationRule[] = [];

  constructor(customRules?: ClassificationRule[]) {
    this.rules = [...DEFAULT_RULES];
    if (customRules) {
      this.customRules = customRules;
      this.rules = [...customRules, ...DEFAULT_RULES];
    }
  }

  /**
   * Classify a proposal's risk level
   */
  classify(proposal: EvolutionProposal): {
    level: RiskLevel;
    reason: string;
    matchedRule?: string;
  } {
    // Check custom rules first
    for (const rule of this.customRules) {
      const result = this.matchRule(rule, proposal);
      if (result) {
        return result;
      }
    }

    // Check default rules
    for (const rule of this.rules) {
      const result = this.matchRule(rule, proposal);
      if (result) {
        return result;
      }
    }

    // Default classification based on target type
    return this.defaultClassification(proposal);
  }

  /**
   * Add a custom rule
   */
  addRule(rule: ClassificationRule): void {
    this.customRules.unshift(rule);
    this.rules.unshift(rule);
  }

  /**
   * Remove a custom rule
   */
  removeRule(ruleId: string): boolean {
    const index = this.customRules.findIndex(r => r.id === ruleId);
    if (index !== -1) {
      this.customRules.splice(index, 1);
      this.rules = [...this.customRules, ...DEFAULT_RULES];
      return true;
    }
    return false;
  }

  /**
   * Get all rules
   */
  getRules(): ClassificationRule[] {
    return this.rules;
  }

  // ============================================
  // Private methods
  // ============================================

  private matchRule(
    rule: ClassificationRule,
    proposal: EvolutionProposal
  ): { level: RiskLevel; reason: string; matchedRule: string } | null {
    // Check target type if specified
    if (rule.target && rule.target !== proposal.type) {
      return null;
    }

    // Check pattern
    if (rule.pattern instanceof RegExp) {
      // Test against both change description and target path
      if (rule.pattern.test(proposal.change) || rule.pattern.test(proposal.target)) {
        return {
          level: rule.level,
          reason: rule.reason,
          matchedRule: rule.id,
        };
      }
    } else if (typeof rule.pattern === 'function') {
      if (rule.pattern(proposal)) {
        return {
          level: rule.level,
          reason: rule.reason,
          matchedRule: rule.id,
        };
      }
    }

    return null;
  }

  private defaultClassification(proposal: EvolutionProposal): {
    level: RiskLevel;
    reason: string;
  } {
    switch (proposal.type) {
      case 'skill':
        return { level: 'ask', reason: 'Skill modifications require approval by default' };
      case 'config':
        return { level: 'ask', reason: 'Configuration changes require approval by default' };
      case 'memory':
        return { level: 'ask', reason: 'Memory changes require approval by default' };
      case 'framework':
        return { level: 'forbid', reason: 'Framework changes are high risk by default' };
      default:
        return { level: 'ask', reason: 'Unknown target type - requiring approval' };
    }
  }
}
