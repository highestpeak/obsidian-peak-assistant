/**
 * HarnessSkill = existing SkillDefinition + tier/tool whitelist + body.
 *
 * The body is only injected into context when the model explicitly invokes
 * the skill (model-first discovery). The summary (name + description) is
 * always available in the system prompt.
 */

import type { SkillDefinition } from '@/service/skills/types';
import type { ModelTier } from '../tier/types';

export type SkillInvocation = 'model-first' | 'user-only';

export interface HarnessSkill {
    id: string;
    name: string;
    description: string;
    /** Full prompt body. Only loaded on invoke. */
    body: string;
    allowedTiers: ModelTier[];
    /** Whitelist of tool names. Empty array = no tools. Undefined = unrestricted. */
    allowedTools?: string[];
    invocation: SkillInvocation;
    /** Optional pointer back to the underlying SkillDefinition (for vault-sourced skills). */
    source?: SkillDefinition;
}

export interface SkillSummary {
    id: string;
    name: string;
    description: string;
    invocation: SkillInvocation;
}
