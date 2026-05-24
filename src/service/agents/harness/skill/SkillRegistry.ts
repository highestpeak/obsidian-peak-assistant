/**
 * Harness skill registry. Sits on top of the existing service/skills
 * SkillRegistry: pulls vault/builtin SkillDefinition entries, lifts them
 * into HarnessSkill with tier + tool-whitelist annotations, and exposes a
 * tier-filtered summary builder for system-prompt injection.
 *
 * Hardcoded skills can be registered directly via `register()`.
 */

import { SkillRegistry as SourceSkillRegistry } from '@/service/skills/SkillRegistry';
import type { SkillDefinition } from '@/service/skills/types';
import type { ModelTier } from '../tier/types';
import type { HarnessSkill, SkillSummary } from './types';

export type SkillLifter = (def: SkillDefinition) => HarnessSkill | null;

export class HarnessSkillRegistry {
    private static instance: HarnessSkillRegistry | null = null;

    private skills = new Map<string, HarnessSkill>();
    private lifter: SkillLifter = defaultLifter;

    static getInstance(): HarnessSkillRegistry {
        if (!HarnessSkillRegistry.instance) {
            HarnessSkillRegistry.instance = new HarnessSkillRegistry();
        }
        return HarnessSkillRegistry.instance;
    }

    static resetInstance(): void {
        HarnessSkillRegistry.instance = null;
    }

    /** Override how SkillDefinition → HarnessSkill is computed. */
    setLifter(lifter: SkillLifter): void {
        this.lifter = lifter;
    }

    register(skill: HarnessSkill): void {
        this.skills.set(skill.id, skill);
    }

    unregister(id: string): void {
        this.skills.delete(id);
    }

    get(id: string): HarnessSkill | undefined {
        return this.skills.get(id);
    }

    all(): HarnessSkill[] {
        return [...this.skills.values()];
    }

    /**
     * Pull every SkillDefinition from the source registry and lift into
     * HarnessSkill entries. Safe to call repeatedly; existing entries with
     * the same id are overwritten.
     */
    importFromSource(): void {
        const source = SourceSkillRegistry.getInstance();
        for (const def of source.getAll()) {
            const lifted = this.lifter(def);
            if (lifted) this.skills.set(lifted.id, lifted);
        }
    }

    forTier(tier: ModelTier): HarnessSkill[] {
        return this.all().filter((s) => s.allowedTiers.includes(tier));
    }

    /**
     * Build the "model-first" summary line list. Only name + description
     * (≤1 KB total in practice). The body is injected separately when the
     * model invokes the skill.
     */
    buildSummary(tier: ModelTier): SkillSummary[] {
        return this.forTier(tier)
            .filter((s) => s.invocation === 'model-first')
            .map((s) => ({ id: s.id, name: s.name, description: s.description, invocation: s.invocation }));
    }

    /** Render the summaries as a plain text block (drop into system prompt). */
    buildSummaryBlock(tier: ModelTier): string {
        const items = this.buildSummary(tier);
        if (items.length === 0) return '';
        return items.map((s) => `- ${s.id}: ${s.description}`).join('\n');
    }

    clear(): void {
        this.skills.clear();
    }
}

/**
 * Default lifter: treats every SkillDefinition as model-first, exposes it
 * to all tiers, and uses its declared builtin tool whitelist (if any).
 * Higher-level callers can replace this via setLifter.
 */
export const defaultLifter: SkillLifter = (def) => {
    if (!def?.id || !def?.description) return null;
    return {
        id: def.id,
        name: def.name ?? def.id,
        description: def.description,
        body: def.systemPrompt ?? '',
        allowedTiers: ['local-fast', 'local-deep', 'online'],
        allowedTools: def.tools?.builtin ? [...def.tools.builtin, ...(def.tools.mcp ?? [])] : undefined,
        invocation: 'model-first',
        source: def,
    };
};
