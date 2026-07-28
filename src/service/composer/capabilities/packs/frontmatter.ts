/**
 * Peak Composer — frontmatter (metadata) capability pack (WP5, handoff §8.3).
 *
 * Registers the AI property-suggestion capability: given the document body and
 * the current frontmatter, it proposes fields (tags, canonical type/status/…)
 * as INDEPENDENT per-field candidates the user accepts/rejects one by one
 * (§8.3). It never impersonates a program field, and nothing reaches YAML
 * without confirmation — the typed `metadata-field-patch` result flows through
 * the metadata writeback adapter only on accept (§8.4).
 *
 * The deterministic paths (Vault property library selection, custom key/value)
 * do not need a model and are committed directly by the block UI via
 * `buildMetadataFieldPatchOperations`; they are not capabilities.
 */

import { PromptId } from '@/core/types/prompt';
import {
	COMPOSER_METADATA_FIELD_PATCH_WRITEBACK_ID,
	COMPOSER_METADATA_SUGGESTION_RENDERER_ID,
	type ComposerCapabilityAvailability,
	type ComposerCapabilityDefinition,
	type ComposerCapabilityPack,
	type ComposerContextSnapshot,
} from '@/core/composer';
import {
	ComposerInstructionInputSchema,
	ComposerMetadataFieldPatchPayloadSchema,
} from '@/core/schemas/composer';
import {
	DEFAULT_COMPOSER_CAPABILITIES_CONFIG,
	type ComposerCapabilitiesConfigProvider,
} from '../capabilityConfig';

/** Stable capability id — canonical identity across surfaces. */
export const SUGGEST_PROPERTIES_CAPABILITY_ID = 'composer.frontmatter.suggest-properties';
export const SUGGEST_TAGS_CAPABILITY_ID = 'composer.frontmatter.suggest-tags';
export const NORMALIZE_PROPERTIES_CAPABILITY_ID = 'composer.frontmatter.normalize-properties';
export const FRONTMATTER_QUICK_ACTION_IDS = [
	SUGGEST_TAGS_CAPABILITY_ID,
	NORMALIZE_PROPERTIES_CAPABILITY_ID,
] as const;
export const SUGGEST_PROPERTIES_PROMPT_ID = PromptId.ComposerSuggestProperties;

export interface SuggestPropertiesPromptInput {
	content: string;
	title?: string;
	currentProperties: string;
	instruction?: string;
}

/** Single source of truth for the suggest-properties template variables. */
export function buildSuggestPropertiesPromptVariables(
	input: SuggestPropertiesPromptInput,
): Record<string, unknown> {
	return {
		content: input.content,
		...(input.title !== undefined ? { title: input.title } : {}),
		currentProperties: input.currentProperties,
		...(input.instruction !== undefined ? { instruction: input.instruction } : {}),
	};
}

function evaluateSuggest(
	snapshot: ComposerContextSnapshot,
	emptyReason: string,
): ComposerCapabilityAvailability {
	// The document body (after the frontmatter) is the evidence the suggestion
	// reasons over; with no body there is nothing to infer from.
	const body = snapshot.nearby?.after ?? '';
	if (body.trim().length === 0) return { state: 'disabled', reason: emptyReason };
	return { state: 'available' };
}

export function createSuggestPropertiesDefinition(
	config: ComposerCapabilitiesConfigProvider,
): ComposerCapabilityDefinition {
	return {
		manifest: {
			id: SUGGEST_PROPERTIES_CAPABILITY_ID,
			title: 'Suggest properties',
			description: 'Propose frontmatter fields (tags, type, status) from the document and vault',
			inputContract: { kind: 'object', description: 'Frozen frontmatter context plus optional instruction' },
			outputContract: { kind: 'custom', description: 'metadata-field-patch candidates' },
			permissionKind: 'read',
			costTier: 'fast',
			backendPolicy: { preferred: 'provider-direct', fallback: [] },
			skillRef: SUGGEST_PROPERTIES_CAPABILITY_ID,
			surfaceBinding: ['composer'],
		},
		version: '1',
		owner: 'composer-frontmatter',
		configKey: SUGGEST_PROPERTIES_CAPABILITY_ID,
		surfaces: ['block-row'],
		targetKinds: ['frontmatter'],
		executionMode: 'model-stream',
		effectKind: 'metadata-patch',
		promptId: SUGGEST_PROPERTIES_PROMPT_ID,
		inputSchema: ComposerInstructionInputSchema,
		resultSchema: ComposerMetadataFieldPatchPayloadSchema,
		resultKind: 'metadata-field-patch',
		rendererId: COMPOSER_METADATA_SUGGESTION_RENDERER_ID,
		writebackAdapterId: COMPOSER_METADATA_FIELD_PATCH_WRITEBACK_ID,
		acceptsInstruction: true,
		presentationFallback: {
			title: 'AI 属性建议',
			description: '根据正文与 Vault 关系推荐字段，逐条确认',
			lucideIcon: 'sparkles',
			historyLabel: 'AI 属性建议',
			order: 40,
		},
		evaluate: ({ snapshot }) => evaluateSuggest(snapshot, config().strings.emptyTarget),
		buildPromptVariables: (snapshot, instruction) =>
			buildSuggestPropertiesPromptVariables({
				content: snapshot.nearby?.after ?? '',
				currentProperties: snapshot.targetSource,
				...(instruction !== undefined ? { instruction } : {}),
			}),
	};
}

function createFrontmatterQuickDefinition(
	config: ComposerCapabilitiesConfigProvider,
	id: (typeof FRONTMATTER_QUICK_ACTION_IDS)[number],
): ComposerCapabilityDefinition {
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
		manifest: {
			id,
			title: presentation.title,
			description: presentation.description,
			inputContract: { kind: 'object', description: 'Frozen frontmatter and document evidence' },
			outputContract: { kind: 'custom', description: 'one metadata-field-patch candidate' },
			permissionKind: 'read',
			costTier: 'fast',
			backendPolicy: { preferred: 'provider-direct', fallback: [] },
			skillRef: id,
			surfaceBinding: ['composer'],
		},
		version: '1',
		owner: 'composer-frontmatter',
		configKey: id,
		surfaces: ['block-row'],
		targetKinds: ['frontmatter'],
		executionMode: 'model-stream',
		effectKind: 'metadata-patch',
		promptId: SUGGEST_PROPERTIES_PROMPT_ID,
		inputSchema: ComposerInstructionInputSchema,
		resultSchema: ComposerMetadataFieldPatchPayloadSchema,
		resultKind: 'metadata-field-patch',
		rendererId: COMPOSER_METADATA_SUGGESTION_RENDERER_ID,
		writebackAdapterId: COMPOSER_METADATA_FIELD_PATCH_WRITEBACK_ID,
		acceptsInstruction: false,
		presentationFallback: {
			title: presentation.title,
			description: presentation.description,
			lucideIcon: presentation.lucideIcon,
			historyLabel: presentation.historyLabel,
			order: presentation.order,
		},
		evaluate: ({ snapshot }) => evaluateSuggest(snapshot, config().strings.emptyTarget),
		buildPromptVariables: (snapshot) => {
			const instruction = config().instructions[id];
			if (!instruction) throw new Error(`missing Composer preset instruction for '${id}'`);
			return buildSuggestPropertiesPromptVariables({
				content: snapshot.nearby?.after ?? '',
				currentProperties: snapshot.targetSource,
				instruction,
			});
		},
	};
}

export function createFrontmatterCapabilityPack(
	config: ComposerCapabilitiesConfigProvider,
): ComposerCapabilityPack {
	return {
		id: 'composer-pack-frontmatter',
		definitions: () => [
			createSuggestPropertiesDefinition(config),
			...FRONTMATTER_QUICK_ACTION_IDS.map((id) => createFrontmatterQuickDefinition(config, id)),
		],
	};
}
