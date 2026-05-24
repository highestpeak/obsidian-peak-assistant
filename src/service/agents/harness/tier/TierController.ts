/**
 * Stateful tier router. See spec §3.1.
 *
 * Lifetime: one instance per AgentLoop run.
 * Drives cascade between local-fast → local-deep → online, capped by
 * policy.maxEscalationsPerLoop. Exposes an `escalate` tool so the model
 * can self-flag low confidence.
 */

import { tool } from 'ai';
import { z } from 'zod';
import type { ModelTier, TierBinding, TierBindings, TierPolicy } from './types';
import { TIER_ORDER, DEFAULT_TIER_POLICY } from './types';
import { scoreStep, type ScoreStepOptions } from './scoreStep';
import type { StepResult, TraceBus } from '../trace/events';

export interface TierControllerOptions {
    bindings: TierBindings;
    policy?: Partial<TierPolicy>;
    trace?: TraceBus;
    loopId?: string;
}

export class TierController {
    private readonly bindings: TierBindings;
    private readonly policy: TierPolicy;
    private readonly trace?: TraceBus;
    private readonly loopId: string;

    private activeTier: ModelTier;
    private escalations = 0;
    private forcedNextScore: number | null = null;

    constructor(opts: TierControllerOptions) {
        this.bindings = opts.bindings;
        this.policy = { ...DEFAULT_TIER_POLICY, ...opts.policy };
        this.trace = opts.trace;
        this.loopId = opts.loopId ?? 'unknown';
        const start = this.resolveStartTier(this.policy.preferred);
        if (!start) {
            throw new Error('[TierController] No usable tier bindings provided');
        }
        this.activeTier = start;
    }

    /** Pick the preferred tier if bound, else fall back to the next available. */
    private resolveStartTier(preferred: ModelTier): ModelTier | null {
        const idx = TIER_ORDER.indexOf(preferred);
        for (let i = idx; i < TIER_ORDER.length; i += 1) {
            const t = TIER_ORDER[i];
            if (this.bindings[t]) return t;
        }
        for (const t of TIER_ORDER) if (this.bindings[t]) return t;
        return null;
    }

    current(): TierBinding {
        const b = this.bindings[this.activeTier];
        if (!b) throw new Error(`[TierController] active tier ${this.activeTier} has no binding`);
        return b;
    }

    currentTier(): ModelTier {
        return this.activeTier;
    }

    escalationCount(): number {
        return this.escalations;
    }

    /** AI SDK tool exposed to the model for explicit upgrade requests. */
    escalateTool() {
        const self = this;
        return tool({
            description:
                'Escalate to a more capable model tier when current model is uncertain. ' +
                'Use only when you cannot confidently complete the task with current capabilities.',
            inputSchema: z.object({
                reason: z.string().describe('Why escalation is needed'),
            }),
            execute: async ({ reason }: { reason: string }) => {
                const upgraded = self.tryUpgrade(reason, false);
                if (upgraded) {
                    return { upgraded: true, newTier: self.activeTier };
                }
                return { upgraded: false, message: 'Already at top tier or escalation budget exhausted' };
            },
        });
    }

    /** Called after a step finishes by AgentLoop. May auto-upgrade. */
    onStepFinish(step: StepResult, scoreOpts?: ScoreStepOptions): number {
        const score = scoreStep(step, scoreOpts);
        if (!this.policy.allowEscalation) return score;
        if (this.escalations >= this.policy.maxEscalationsPerLoop) return score;
        if (score < this.policy.escalationThreshold) {
            this.tryUpgrade(`auto: score=${score.toFixed(2)}`, true);
        }
        return score;
    }

    /** Force the next scoreStep call (rare; used by the escalate tool). */
    markForcedScore(score: number): void {
        this.forcedNextScore = score;
    }

    consumeForcedScore(): number | null {
        const v = this.forcedNextScore;
        this.forcedNextScore = null;
        return v;
    }

    private tryUpgrade(reason: string, auto: boolean): boolean {
        if (this.escalations >= this.policy.maxEscalationsPerLoop) return false;
        const next = this.nextBoundTier(this.activeTier);
        if (!next) return false;
        const from = this.activeTier;
        this.activeTier = next;
        this.escalations += 1;
        this.trace?.emit('tier_escalate', {
            loopId: this.loopId,
            from,
            to: next,
            reason,
            auto,
        });
        return true;
    }

    private nextBoundTier(t: ModelTier): ModelTier | null {
        const idx = TIER_ORDER.indexOf(t);
        for (let i = idx + 1; i < TIER_ORDER.length; i += 1) {
            const candidate = TIER_ORDER[i];
            if (this.bindings[candidate]) return candidate;
        }
        return null;
    }
}
