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
	COMPOSER_BLOCK_INSERTION_WRITEBACK_ID,
	COMPOSER_LIST_ITEM_PATCH_RENDERER_ID,
	COMPOSER_LIST_ITEM_PATCH_WRITEBACK_ID,
	COMPOSER_STREAMING_TEXT_RENDERER_ID,
	COMPOSER_TEXT_PATCH_WRITEBACK_ID,
	type ComposerCapabilityAvailability,
	type ComposerCapabilityDefinition,
	type ComposerCapabilityEffectKind,
	type ComposerCapabilityPack,
	type ComposerContextSnapshot,
} from '@/core/composer';
import {
	ComposerBlockInsertionPayloadSchema,
	ComposerInstructionInputSchema,
	ComposerListItemPatchPayloadSchema,
	ComposerTextPatchPayloadSchema,
} from '@/core/schemas/composer';
import {
	DEFAULT_COMPOSER_CAPABILITIES_CONFIG,
	type ComposerCapabilitiesConfigProvider,
} from '../capabilityConfig';

// ── Shared identity (Composer definition ⇄ production Copilot action) ────────

/** Stable capability id — the canonical identity across every surface. */
export const POLISH_CAPABILITY_ID = 'composer.prose.polish';

/** Production Copilot action id this definition is the canonical form of. */
export const POLISH_COPILOT_ACTION_ID = 'polish';

/** Template-registered prompt shared by both invocation paths. */
export const POLISH_PROMPT_ID = PromptId.DocPolish;
export const PROSE_TRANSFORM_PROMPT_ID = PromptId.ComposerProseTransform;
export const FILL_GAPS_CAPABILITY_ID = 'composer.list.fill-gaps';

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

export interface ProseTransformPromptInput {
	content: string;
	before?: string;
	after?: string;
	blockKind: string;
	instruction: string;
}

/** Shared variables for the source-safe one-block transform prompt. */
export function buildProseTransformPromptVariables(
	input: ProseTransformPromptInput,
): Record<string, unknown> {
	return {
		content: input.content,
		blockKind: input.blockKind,
		instruction: input.instruction,
		...(input.before !== undefined ? { before: input.before } : {}),
		...(input.after !== undefined ? { after: input.after } : {}),
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

interface ProseTransformSpec {
	id: string;
	targetKind: 'paragraph' | 'heading' | 'list' | 'task' | 'quote' | 'callout';
	effectKind: Extract<ComposerCapabilityEffectKind, 'rewrite' | 'insert' | 'transform'>;
	resultMode?: 'insert-block' | 'insert-list-item';
	/** First action for each kind doubles as the custom-instruction execution path. */
	acceptsInstruction: boolean;
}

const PROSE_TRANSFORM_SPECS: readonly ProseTransformSpec[] = [
	{ id: 'composer.prose.polish-block', targetKind: 'paragraph', effectKind: 'rewrite', acceptsInstruction: true },
	{ id: 'composer.prose.add-example', targetKind: 'paragraph', effectKind: 'insert', resultMode: 'insert-block', acceptsInstruction: false },
	{ id: 'composer.prose.to-table', targetKind: 'paragraph', effectKind: 'transform', acceptsInstruction: false },
	{ id: 'composer.heading.shorten', targetKind: 'heading', effectKind: 'rewrite', acceptsInstruction: true },
	{ id: 'composer.heading.outline', targetKind: 'heading', effectKind: 'insert', resultMode: 'insert-block', acceptsInstruction: false },
	{ id: 'composer.heading.questions', targetKind: 'heading', effectKind: 'insert', resultMode: 'insert-block', acceptsInstruction: false },
	{ id: FILL_GAPS_CAPABILITY_ID, targetKind: 'list', effectKind: 'insert', resultMode: 'insert-list-item', acceptsInstruction: true },
	{ id: 'composer.list.reorder', targetKind: 'list', effectKind: 'transform', acceptsInstruction: false },
	{ id: 'composer.list.to-table', targetKind: 'list', effectKind: 'transform', acceptsInstruction: false },
	{ id: 'composer.task.find-blockers', targetKind: 'task', effectKind: 'insert', resultMode: 'insert-block', acceptsInstruction: true },
	{ id: 'composer.task.add-next-step', targetKind: 'task', effectKind: 'insert', resultMode: 'insert-block', acceptsInstruction: false },
	{ id: 'composer.task.prioritize', targetKind: 'task', effectKind: 'transform', acceptsInstruction: false },
	{ id: 'composer.quote.explain', targetKind: 'quote', effectKind: 'insert', resultMode: 'insert-block', acceptsInstruction: true },
	{ id: 'composer.quote.counterexample', targetKind: 'quote', effectKind: 'insert', resultMode: 'insert-block', acceptsInstruction: false },
	{ id: 'composer.quote.to-callout', targetKind: 'quote', effectKind: 'transform', acceptsInstruction: false },
	{ id: 'composer.callout.change-type', targetKind: 'callout', effectKind: 'rewrite', acceptsInstruction: true },
	{ id: 'composer.callout.expand', targetKind: 'callout', effectKind: 'rewrite', acceptsInstruction: false },
	{ id: 'composer.callout.to-checklist', targetKind: 'callout', effectKind: 'transform', acceptsInstruction: false },
] as const;

export const PROSE_BLOCK_ACTION_IDS = PROSE_TRANSFORM_SPECS.map((spec) => spec.id);

function completePresentation(id: string): ComposerCapabilityDefinition['presentationFallback'] {
	const presentation = DEFAULT_COMPOSER_CAPABILITIES_CONFIG.actions[id];
	if (
		typeof presentation?.title !== 'string' ||
		typeof presentation.description !== 'string' ||
		typeof presentation.lucideIcon !== 'string' ||
		typeof presentation.historyLabel !== 'string' ||
		typeof presentation.order !== 'number'
	) {
		throw new Error(`missing compiled Composer presentation for '${id}'`);
	}
	return {
		title: presentation.title,
		description: presentation.description,
		lucideIcon: presentation.lucideIcon,
		historyLabel: presentation.historyLabel,
		order: presentation.order,
	};
}

function createProseTransformDefinition(
	config: ComposerCapabilitiesConfigProvider,
	spec: ProseTransformSpec,
): ComposerCapabilityDefinition {
	const presentation = completePresentation(spec.id);
	const insertsNewBlock = spec.resultMode === 'insert-block';
	const insertsListItem = spec.resultMode === 'insert-list-item';
	const resultSchema = insertsListItem
		? ComposerListItemPatchPayloadSchema
		: insertsNewBlock
			? ComposerBlockInsertionPayloadSchema
			: ComposerTextPatchPayloadSchema;
	const resultKind = insertsListItem
		? 'list-item-patch' as const
		: insertsNewBlock
			? 'block-insertion' as const
			: 'text-patch' as const;
	return {
		manifest: {
			id: spec.id,
			title: presentation.title,
			description: presentation.description,
			inputContract: { kind: 'object', description: 'Frozen one-block context plus optional custom instruction' },
			outputContract: {
				kind: 'custom',
				description: insertsListItem
					? 'one source-safe list-item patch candidate'
					: insertsNewBlock
						? 'one source-safe block-insertion candidate'
						: 'one source-safe text-patch candidate',
			},
			permissionKind: 'read',
			costTier: 'fast',
			backendPolicy: { preferred: 'provider-direct', fallback: [] },
			skillRef: spec.id,
			surfaceBinding: ['composer'],
		},
		version: '1',
		owner: 'composer-prose',
		configKey: spec.id,
		surfaces: ['block-row'],
		targetKinds: [spec.targetKind],
		executionMode: 'model-stream',
		effectKind: spec.effectKind,
		promptId: PROSE_TRANSFORM_PROMPT_ID,
		inputSchema: ComposerInstructionInputSchema,
		resultSchema,
		resultKind,
		rendererId: insertsListItem
			? COMPOSER_LIST_ITEM_PATCH_RENDERER_ID
			: COMPOSER_STREAMING_TEXT_RENDERER_ID,
		writebackAdapterId: insertsListItem
			? COMPOSER_LIST_ITEM_PATCH_WRITEBACK_ID
			: insertsNewBlock
				? COMPOSER_BLOCK_INSERTION_WRITEBACK_ID
				: COMPOSER_TEXT_PATCH_WRITEBACK_ID,
		acceptsInstruction: spec.acceptsInstruction,
		presentationFallback: presentation,
		evaluate: ({ snapshot }) => evaluatePolish(snapshot, config().strings.emptyTarget),
		buildPromptVariables: (snapshot, instruction, extras) => {
			const baseInstruction = instruction?.trim() || config().instructions[spec.id];
			const placementInstruction =
				extras?.placement?.kind === 'list-gap'
					? config().strings.listGapPlacementInstruction.replace(
							'{index}',
							String(extras.placement.insertionIndex),
						)
					: '';
			const effectiveInstruction = [baseInstruction, placementInstruction]
				.filter(Boolean)
				.join('\n');
			if (!effectiveInstruction) {
				throw new Error(`missing Composer preset instruction for '${spec.id}'`);
			}
			return buildProseTransformPromptVariables({
				content: snapshot.targetSource,
				blockKind: spec.targetKind,
				instruction: effectiveInstruction,
				...(snapshot.nearby?.before ? { before: snapshot.nearby.before } : {}),
				...(snapshot.nearby?.after ? { after: snapshot.nearby.after } : {}),
			});
		},
	};
}

/** The prose pack (spec §12 registration API). */
export function createProseCapabilityPack(
	config: ComposerCapabilitiesConfigProvider,
): ComposerCapabilityPack {
	return {
		id: 'composer-pack-prose',
		definitions: () => [
			createPolishDefinition(config),
			...PROSE_TRANSFORM_SPECS.map((spec) => createProseTransformDefinition(config, spec)),
		],
	};
}
