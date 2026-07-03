import { z } from 'zod/v3';

// Zod schema for CopilotCommandCenterAgent — the meta-agent that drafts a
// capability sequence when the user opens the Copilot command center.
// See docs/superpowers/specs/2026-05-14-copilot-command-center-user-centered-redesign.md

export const capabilityPlanStepSchema = z.object({
	stepNumber: z.number().int().min(1),
	commandId: z.string(),
	commandLabel: z.string(),
	rationale: z.string(),
	/** Optional short summary of what the user should verify before the next step runs. */
	reviewHint: z.string().optional(),
	/** True if this step is a read-only inspection; false = writes to vault / dispatches a chat call. */
	readOnly: z.boolean(),
});

export const capabilityPlanSchema = z.object({
	planTitle: z.string(),
	summary: z.string(),
	steps: z.array(capabilityPlanStepSchema).min(1).max(8),
	confidence: z.number().min(0).max(1),
	/** Human-readable list of "you asked me to" cues so the user can sanity-check the goal. */
	goalRestatement: z.string(),
});

export type CapabilityPlanStep = z.infer<typeof capabilityPlanStepSchema>;
export type CapabilityPlan = z.infer<typeof capabilityPlanSchema>;
