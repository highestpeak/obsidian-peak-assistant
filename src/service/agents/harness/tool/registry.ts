/**
 * Process-scoped ToolRegistry. Tools register once and any AgentLoop run
 * pulls the slice it needs (filtered by tier + explicit name whitelist).
 */

import type { ModelTier } from '../tier/types';
import type { ToolDef } from './types';

export class ToolRegistry {
    private tools = new Map<string, ToolDef>();

    register(def: ToolDef): void {
        if (this.tools.has(def.name)) {
            throw new Error(`[ToolRegistry] duplicate tool name: ${def.name}`);
        }
        this.tools.set(def.name, def);
    }

    registerAll(defs: ToolDef[]): void {
        for (const d of defs) this.register(d);
    }

    has(name: string): boolean {
        return this.tools.has(name);
    }

    get(name: string): ToolDef | undefined {
        return this.tools.get(name);
    }

    all(): ToolDef[] {
        return [...this.tools.values()];
    }

    /**
     * Return the tools usable by `tier`, optionally restricted to a name
     * whitelist (e.g. a skill's allowedTools).
     */
    forTier(tier: ModelTier, allowedNames?: ReadonlyArray<string>): ToolDef[] {
        const filter = allowedNames ? new Set(allowedNames) : null;
        const out: ToolDef[] = [];
        for (const def of this.tools.values()) {
            if (filter && !filter.has(def.name)) continue;
            if (def.allowedTiers && !def.allowedTiers.includes(tier)) continue;
            out.push(def);
        }
        return out;
    }

    clear(): void {
        this.tools.clear();
    }
}
