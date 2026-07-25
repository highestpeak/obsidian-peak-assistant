/**
 * Peak Composer — prose capability pack (WP3 vertical slice).
 *
 * First registered text capability: `composer.prose.polish`. This is the
 * CANONICAL definition of the production Copilot `polish` action (handoff
 * §11.7 / spec Appendix A): both surfaces share the stable identity, the
 * PromptId binding and the prompt-variable mapping below — the Copilot action
 * in `src/service/copilot/actions/index.ts` imports these instead of keeping
 * its own copy, and Composer projects the same definition through the
 * capability runtime. Surface projection (labels, placement) differs by
 * config; the execution contract does not. The legacy Copilot invocation path
 * keeps working until the WP10 parity gate deletes it.
 */

import { PromptId } from '@/core/types/prompt';
import {
	COMPOSER_STREAMING_TEXT_RENDERER_ID,
	COMPOSER_TEXT_PATCH_WRITEBACK_ID,
	type ComposerCapabilityAvailability,
	type ComposerCapabilityDefinition,
	type ComposerCapabilityPack,
	type ComposerContextSnapshot,
} from '@/core/composer';
import {
	ComposerInstructionInputSchema,
	ComposerTextPatchPayloadSchema,
} from '@/core/schemas/composer';
import type { ComposerCapabilitiesConfigProvider } from '../capabilityConfig';

// ── Shared identity (Composer definition ⇄ production Copilot action) ────────

/** Stable capability id — the canonical identity across every surface. */
export const POLISH_CAPABILITY_ID = 'composer.prose.polish';

/** Production Copilot action id this definition is the canonical form of. */
export const POLISH_COPILOT_ACTION_ID = 'polish';

/** Template-registered prompt shared by both invocation paths. */
export const POLISH_PROMPT_ID = PromptId.DocPolish;

export interface PolishPromptInput {
	content: string;
	title?: string;
	scope: 'full' | 'selection';
	instruction?: string;
}

/**
 * Single source of truth for DocPolish template variables. Used by BOTH the
 * Composer executor path and the legacy Copilot `streamAction` path so the
 * prompt contract cannot drift between surfaces.
 */
export function buildPolishPromptVariables(input: PolishPromptInput): Record<string, unknown> {
	return {
		content: input.content,
		...(input.title !== undefined ? { title: input.title } : {}),
		scope: input.scope,
		...(input.instruction !== undefined ? { instruction: input.instruction } : {}),
	};
}

// ── Composer definition ───────────────────────────────────────────────────────

/** Text-bearing block kinds polish can rewrite in place. */
const POLISH_TARGET_KINDS = ['paragraph', 'heading', 'quote', 'callout', 'list', 'task'] as const;

function evaluatePolish(
	snapshot: ComposerContextSnapshot,
	emptyTargetReason: string,
): ComposerCapabilityAvailability {
	const content = snapshot.selectionText ?? snapshot.targetSource;
	if (content.trim().length === 0) return { state: 'disabled', reason: emptyTargetReason };
	return { state: 'available' };
}

export function createPolishDefinition(
	config: ComposerCapabilitiesConfigProvider,
): ComposerCapabilityDefinition {
	return {
		manifest: {
			id: POLISH_CAPABILITY_ID,
			title: 'Polish text',
			description: 'Improve clarity and style of the targeted text without changing its meaning',
			inputContract: { kind: 'object', description: 'Frozen composer context plus optional targeted instruction' },
			outputContract: { kind: 'custom', description: 'text-patch candidate variants' },
			permissionKind: 'read',
			costTier: 'fast',
			backendPolicy: { preferred: 'provider-direct', fallback: [] },
			skillRef: POLISH_CAPABILITY_ID,
			surfaceBinding: ['composer', 'copilot'],
		},
		version: '1',
		owner: 'composer-prose',
		configKey: POLISH_CAPABILITY_ID,
		surfaces: ['block-row', 'selection-toolbar'],
		targetKinds: POLISH_TARGET_KINDS,
		executionMode: 'model-stream',
		effectKind: 'rewrite',
		promptId: POLISH_PROMPT_ID,
		inputSchema: ComposerInstructionInputSchema,
		resultSchema: ComposerTextPatchPayloadSchema,
		resultKind: 'text-patch',
		rendererId: COMPOSER_STREAMING_TEXT_RENDERER_ID,
		writebackAdapterId: COMPOSER_TEXT_PATCH_WRITEBACK_ID,
		acceptsInstruction: true,
		copilotActionId: POLISH_COPILOT_ACTION_ID,
		presentationFallback: {
			title: 'Polish text',
			description: 'Improve clarity and style without changing meaning',
			lucideIcon: 'sparkles',
			historyLabel: 'AI polish',
			order: 10,
		},
		evaluate: ({ snapshot }) => evaluatePolish(snapshot, config().strings.emptyTarget),
		buildPromptVariables: (snapshot, instruction) =>
			buildPolishPromptVariables({
				content: snapshot.selectionText ?? snapshot.targetSource,
				scope: snapshot.selectionText !== undefined ? 'selection' : 'full',
				...(instruction !== undefined ? { instruction } : {}),
			}),
	};
}

/** The prose pack (spec §12 registration API). */
export function createProseCapabilityPack(
	config: ComposerCapabilitiesConfigProvider,
): ComposerCapabilityPack {
	return {
		id: 'composer-pack-prose',
		definitions: () => [createPolishDefinition(config)],
	};
}
