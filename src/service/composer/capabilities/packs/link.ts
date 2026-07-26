/**
 * Peak Composer — link / citation / embed / attachment capability pack (WP8, §10.13).
 *
 * Registers `composer.link.tidy`: an AI capability that repairs and enriches the
 * links in a prose-bearing block per a targeted instruction — fixing anchors,
 * expanding embeds to links, converting footnotes, adding backlinks/MOC lines.
 * It rides the text-patch rail (model-stream → text-patch → atomic block
 * replace), so the model returns the full replacement block text.
 *
 * Applicability is GATED to blocks that actually contain a reference token (via
 * the framework-neutral `analyzeLinks`), so the action does not project onto
 * every paragraph — only where there is link work to do.
 *
 * The deterministic transforms (MOC-line generation, broken-link probe,
 * footnote conversion, embed→link) live in `packs/link/linkAnalysis.ts` and are
 * surfaced through the preview / hover layer; this pack is the AI half.
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
import { analyzeLinks } from '../../packs/link';
import type { ComposerCapabilitiesConfigProvider } from '../capabilityConfig';

export const LINK_TIDY_CAPABILITY_ID = 'composer.link.tidy';

/** Prose/list kinds where inline links live and can be repaired in place. */
const LINK_TARGET_KINDS = ['paragraph', 'heading', 'quote', 'callout', 'list', 'task', 'embed'] as const;

function evaluateLinkTidy(
	snapshot: ComposerContextSnapshot,
	noLinksReason: string,
): ComposerCapabilityAvailability {
	const content = snapshot.selectionText ?? snapshot.targetSource;
	if (analyzeLinks(content).length === 0) {
		return { state: 'hidden', reason: noLinksReason };
	}
	return { state: 'available' };
}

export function createLinkTidyDefinition(
	config: ComposerCapabilitiesConfigProvider,
): ComposerCapabilityDefinition {
	return {
		manifest: {
			id: LINK_TIDY_CAPABILITY_ID,
			title: 'Tidy links',
			description: 'Repair anchors, expand embeds, convert footnotes and add backlinks in this block',
			inputContract: { kind: 'object', description: 'Frozen composer context plus optional targeted instruction' },
			outputContract: { kind: 'custom', description: 'text-patch replacing the block with tidied links' },
			permissionKind: 'read',
			costTier: 'fast',
			backendPolicy: { preferred: 'provider-direct', fallback: [] },
			skillRef: LINK_TIDY_CAPABILITY_ID,
			surfaceBinding: ['composer'],
		},
		version: '1',
		owner: 'composer-link',
		configKey: LINK_TIDY_CAPABILITY_ID,
		surfaces: ['block-row'],
		targetKinds: LINK_TARGET_KINDS,
		executionMode: 'model-stream',
		effectKind: 'rewrite',
		promptId: PromptId.DocPolish,
		inputSchema: ComposerInstructionInputSchema,
		resultSchema: ComposerTextPatchPayloadSchema,
		resultKind: 'text-patch',
		rendererId: COMPOSER_STREAMING_TEXT_RENDERER_ID,
		writebackAdapterId: COMPOSER_TEXT_PATCH_WRITEBACK_ID,
		acceptsInstruction: true,
		presentationFallback: {
			title: 'Tidy links',
			description: 'Repair anchors, expand embeds and convert footnotes with AI',
			lucideIcon: 'link',
			historyLabel: 'AI link tidy',
			order: 44,
		},
		evaluate: ({ snapshot }) => evaluateLinkTidy(snapshot, config().strings.emptyTarget),
		buildPromptVariables: (snapshot, instruction) => ({
			content: snapshot.selectionText ?? snapshot.targetSource,
			scope: snapshot.selectionText !== undefined ? 'selection' : 'full',
			instruction:
				instruction && instruction.trim()
					? instruction
					: 'Repair and tidy the links in this block. Return the full block text, preserving all non-link content verbatim.',
		}),
	};
}

export function createLinkCapabilityPack(
	config: ComposerCapabilitiesConfigProvider,
): ComposerCapabilityPack {
	return {
		id: 'composer-pack-link',
		definitions: () => [createLinkTidyDefinition(config)],
	};
}
