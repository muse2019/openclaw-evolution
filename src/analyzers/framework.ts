/**
 * Framework Analyzer
 * Evaluates the overall structure and architecture of OpenClaw setup
 */

import { EvolutionProposal, AnalysisResult } from '../types.js';
import * as fs from 'fs';
import * as path from 'path';

interface FrameworkAnalysis {
  skills: SkillInfo[];
  knowledgeStructure: KnowledgeInfo;
  configHealth: ConfigHealth;
  recommendations: string[];
}

interface SkillInfo {
  name: string;
  path: string;
  hasInstructions: boolean;
  hasTools: boolean;
  lastModified: Date;
  usageCount?: number;
}

interface KnowledgeInfo {
  exists: boolean;
  fileCount: number;
  totalSize: number;
  structure: string[];
}

interface ConfigHealth {
  valid: boolean;
  issues: string[];
}

export class FrameworkAnalyzer {
  private skillsDir: string;
  private configDir: string;
  private memoryDir: string;

  constructor(openclawDir: string) {
    this.skillsDir = path.join(openclawDir, 'workspace/skills');
    this.configDir = path.join(openclawDir, 'config');
    this.memoryDir = path.join(openclawDir, 'memory');
  }

  /**
   * Analyze the framework structure
   */
  async analyze(): Promise<AnalysisResult> {
    const proposals: EvolutionProposal[] = [];
    const insights: string[] = [];

    // Analyze skills
    const skillsAnalysis = await this.analyzeSkills();
    insights.push(`Found ${skillsAnalysis.skills.length} skills`);

    // Check for unused or problematic skills
    for (const skill of skillsAnalysis.skills) {
      if (!skill.hasInstructions && !skill.hasTools) {
        proposals.push({
          id: `evo-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          timestamp: new Date(),
          type: 'skill',
          target: skill.path,
          change: 'Remove or fix empty skill',
          reasoning: `Skill "${skill.name}" has no instructions or tools defined`,
          status: 'pending',
          source: 'timer',
        });
      }
    }

    // Analyze knowledge structure
    const knowledgeAnalysis = await this.analyzeKnowledge();
    if (knowledgeAnalysis.exists) {
      insights.push(`Knowledge base: ${knowledgeAnalysis.fileCount} files, ${Math.round(knowledgeAnalysis.totalSize / 1024)}KB`);

      // Check for optimization opportunities
      if (knowledgeAnalysis.fileCount > 50) {
        proposals.push({
          id: `evo-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          timestamp: new Date(),
          type: 'framework',
          target: 'knowledge-base',
          change: 'Reorganize knowledge structure for better retrieval',
          reasoning: `Large knowledge base (${knowledgeAnalysis.fileCount} files) may benefit from restructuring`,
          status: 'pending',
          source: 'timer',
        });
      }
    }

    // Analyze config
    const configAnalysis = await this.analyzeConfig();
    if (!configAnalysis.valid) {
      insights.push(`Config issues: ${configAnalysis.issues.join(', ')}`);
    }

    // Add framework-level recommendations
    for (const rec of skillsAnalysis.recommendations) {
      proposals.push({
        id: `evo-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        timestamp: new Date(),
        type: 'framework',
        target: 'framework',
        change: rec,
        reasoning: 'Framework improvement recommendation',
        status: 'pending',
        source: 'timer',
      });
    }

    return {
      proposals,
      patterns: [],
      insights,
      confidence: 0.7,
    };
  }

  // ============================================
  // Private methods
  // ============================================

  private async analyzeSkills(): Promise<FrameworkAnalysis> {
    const skills: SkillInfo[] = [];
    const recommendations: string[] = [];

    if (!fs.existsSync(this.skillsDir)) {
      return { skills, knowledgeStructure: { exists: false, fileCount: 0, totalSize: 0, structure: [] }, configHealth: { valid: true, issues: [] }, recommendations };
    }

    const skillDirs = fs.readdirSync(this.skillsDir, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name);

    for (const skillName of skillDirs) {
      const skillPath = path.join(this.skillsDir, skillName);
      const skillMdPath = path.join(skillPath, 'SKILL.md');

      const skillInfo: SkillInfo = {
        name: skillName,
        path: skillPath,
        hasInstructions: false,
        hasTools: false,
        lastModified: new Date(),
      };

      if (fs.existsSync(skillMdPath)) {
        const content = fs.readFileSync(skillMdPath, 'utf-8');
        skillInfo.hasInstructions = content.length > 100;
        skillInfo.hasTools = content.includes('tool') || content.includes('Tool');
        const stat = fs.statSync(skillMdPath);
        skillInfo.lastModified = stat.mtime;
      }

      skills.push(skillInfo);
    }

    // Generate recommendations
    const skillsWithoutInstructions = skills.filter(s => !s.hasInstructions);
    if (skillsWithoutInstructions.length > 0) {
      recommendations.push(`Fix ${skillsWithoutInstructions.length} skills without proper instructions`);
    }

    return { skills, knowledgeStructure: { exists: false, fileCount: 0, totalSize: 0, structure: [] }, configHealth: { valid: true, issues: [] }, recommendations };
  }

  private async analyzeKnowledge(): Promise<KnowledgeInfo> {
    if (!fs.existsSync(this.memoryDir)) {
      return { exists: false, fileCount: 0, totalSize: 0, structure: [] };
    }

    const files = this.getAllFiles(this.memoryDir);
    const totalSize = files.reduce((sum, f) => {
      try {
        return sum + fs.statSync(f).size;
      } catch {
        return sum;
      }
    }, 0);

    const structure = files.map(f => path.relative(this.memoryDir, f));

    return {
      exists: true,
      fileCount: files.length,
      totalSize,
      structure,
    };
  }

  private async analyzeConfig(): Promise<ConfigHealth> {
    const issues: string[] = [];

    if (!fs.existsSync(this.configDir)) {
      return { valid: true, issues: [] };
    }

    // Check for common config issues
    const preferencesPath = path.join(this.configDir, 'preferences.json');
    if (fs.existsSync(preferencesPath)) {
      try {
        const content = fs.readFileSync(preferencesPath, 'utf-8');
        JSON.parse(content);
      } catch {
        issues.push('Invalid JSON in preferences.json');
      }
    }

    return {
      valid: issues.length === 0,
      issues,
    };
  }

  private getAllFiles(dir: string): string[] {
    const files: string[] = [];

    if (!fs.existsSync(dir)) return files;

    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...this.getAllFiles(fullPath));
      } else {
        files.push(fullPath);
      }
    }

    return files;
  }
}
