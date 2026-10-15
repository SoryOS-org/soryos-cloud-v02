/**
 * skill — charge des instructions de compétences spécialisées dans la conversation.
 * Les skills sont des fichiers markdown avec métadonnées YAML qui fournissent
 * des instructions contextuelles pour des tâches spécifiques.
 */

import { globalEventBus } from "@soryos/bus";

export interface SkillDefinition {
  id: string;
  name: string;
  description: string;
  /** Path to the skill's instruction file (markdown) */
  path: string;
  /** Optional resources associated with this skill */
  resources?: string[];
  /** Tags for categorization */
  tags?: string[];
}

export interface SkillLoadResult {
  success: boolean;
  output?: string;
  error?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Built-in skill definitions.
 * In a full implementation, these would be loaded from disk or a registry.
 */
export const BUILTIN_SKILLS: SkillDefinition[] = [
  {
    id: "typescript-expert",
    name: "TypeScript Expert",
    description:
      "Expert guidance for TypeScript development including type patterns, generics, decorators, and best practices.",
    path: "skills/typescript-expert.md",
    tags: ["typescript", "javascript", "types"],
  },
  {
    id: "react-specialist",
    name: "React Specialist",
    description:
      "Specialized knowledge for React development including hooks, performance optimization, and component patterns.",
    path: "skills/react-specialist.md",
    tags: ["react", "frontend", "components"],
  },
  {
    id: "api-design",
    name: "API Design",
    description:
      "Guidelines for designing RESTful and GraphQL APIs including versioning, pagination, and error handling.",
    path: "skills/api-design.md",
    tags: ["api", "rest", "graphql", "backend"],
  },
  {
    id: "testing-strategy",
    name: "Testing Strategy",
    description:
      "Comprehensive testing strategies including unit, integration, and e2e testing patterns.",
    path: "skills/testing-strategy.md",
    tags: ["testing", "jest", "vitest", "e2e"],
  },
  {
    id: "security-audit",
    name: "Security Audit",
    description:
      "Security best practices for code review including OWASP top 10, authentication, and data protection.",
    path: "skills/security-audit.md",
    tags: ["security", "owasp", "authentication"],
  },
];

export function getSkillDefinition(id: string): SkillDefinition | undefined {
  return BUILTIN_SKILLS.find((s) => s.id === id);
}

export function listSkills(): SkillDefinition[] {
  return BUILTIN_SKILLS;
}

export function searchSkills(query: string): SkillDefinition[] {
  const lower = query.toLowerCase();
  return BUILTIN_SKILLS.filter(
    (s) =>
      s.id.toLowerCase().includes(lower) ||
      s.name.toLowerCase().includes(lower) ||
      s.description.toLowerCase().includes(lower) ||
      s.tags?.some((t) => t.toLowerCase().includes(lower))
  );
}

export class SkillTool {
  /**
   * Load a skill by ID and return its instructions.
   */
  async loadSkill(id: string): Promise<SkillLoadResult> {
    const callId = `skill-${Date.now()}`;
    const trimmed = id.trim();

    if (!trimmed) {
      return { success: false, error: "Skill ID must not be empty." };
    }

    globalEventBus.emit("tool.started", { toolName: "skill", input: { id: trimmed }, callId });

    const skill = getSkillDefinition(trimmed);
    if (!skill) {
      const available = BUILTIN_SKILLS.map((s) => s.id).join(", ");
      const message = `Skill "${trimmed}" not found. Available skills: ${available}`;
      globalEventBus.emit("tool.failed", { toolName: "skill", error: message, callId });
      return { success: false, error: message };
    }

    // In a full implementation, this would read the skill file from disk.
    // For now, we return the skill metadata and a placeholder for the instructions.
    const instructions = [
      `# ${skill.name}`,
      "",
      `## Description`,
      skill.description,
      "",
      `## Instructions`,
      "",
      `[Skill instructions for "${skill.name}" would be loaded from ${skill.path}]`,
      "",
      `Follow these specialized instructions when working on tasks related to ${skill.tags?.join(", ") ?? "this domain"}.`,
    ].join("\n");

    const output = instructions;
    const metadata = {
      skillId: skill.id,
      skillName: skill.name,
      tags: skill.tags ?? [],
    };

    globalEventBus.emit("tool.completed", { toolName: "skill", output, callId, metadata });
    return { success: true, output, metadata };
  }

  /**
   * List all available skills.
   */
  listSkills(): SkillLoadResult {
    const callId = `skill-list-${Date.now()}`;
    globalEventBus.emit("tool.started", { toolName: "skill_list", input: {}, callId });

    const skills = BUILTIN_SKILLS.map(
      (s, i) =>
        `${i + 1}. **${s.name}** (${s.id})\n   ${s.description}\n   Tags: ${s.tags?.join(", ") ?? "none"}`
    ).join("\n\n");

    const output = `Available skills:\n\n${skills}`;
    const metadata = { count: BUILTIN_SKILLS.length };

    globalEventBus.emit("tool.completed", { toolName: "skill_list", output, callId, metadata });
    return { success: true, output, metadata };
  }
}
