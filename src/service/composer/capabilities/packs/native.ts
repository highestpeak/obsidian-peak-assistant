/**
 * Peak Composer — native objects capability pack (WP8, §10.11 / §10.13).
 *
 * Registers the AI capabilities for native objects that ride the existing
 * text-patch rail (model-stream → text-patch → atomic block replace):
 *   - `composer.mermaid.edit` — incrementally edit a ```mermaid diagram's source
 *     per a targeted instruction; the candidate re-renders and is reviewed
 *     before accept (handoff §10.11: AI patch modifies Mermaid source);
 *   - `composer.code.edit` — rewrite/refactor a code block per instruction while
 *     keeping it a fenced code block (rich formatting stays suppressed, §7.4).
 *
 * Both reuse `PromptId.DocPolish` (the generic "improve this content per
 * instruction" prompt) with the FULL block source as content, so the model
 * returns a full replacement for the block's source range — the text-patch
 * writeback then replaces `[from,to)` atomically. Presentation is config-driven
 * with a compiled fallback carried on each definition.
 *
 * The deterministic Base/Canvas/Excalidraw structural patches are NOT AI runs —
 * they are typed patches applied through the native-file port (see
 * `packs/native/*` + `nativeFilePatch.ts`), so they do not register here.
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

export const MERMAID_EDIT_CAPABILITY_ID = 'composer.mermaid.edit';
export const CODE_EDIT_CAPABILITY_ID = 'composer.code.edit';

function nonEmpty(
	snapshot: ComposerContextSnapshot,
	emptyReason: string,
): ComposerCapabilityAvailability {
	const content = snapshot.selectionText ?? snapshot.targetSource;
	if (content.trim().length === 0) return { state: 'disabled', reason: emptyReason };
	return { state: 'available' };
}

/** Shared prompt-variable mapping: the whole block is the content to rewrite. */
function buildEditPromptVariables(
	snapshot: ComposerContextSnapshot,
	instruction: string | undefined,
	defaultInstruction: string,
): Record<string, unknown> {
	return {
		content: snapshot.selectionText ?? snapshot.targetSource,
		scope: snapshot.selectionText !== undefined ? 'selection' : 'full',
		instruction: instruction && instruction.trim() ? instruction : defaultInstruction,
	};
}

export function createMermaidEditDefinition(
	config: ComposerCapabilitiesConfigProvider,
): ComposerCapabilityDefinition {
	return {
		manifest: {
			id: MERMAID_EDIT_CAPABILITY_ID,
			title: 'Edit diagram',
			description: 'Incrementally edit the Mermaid diagram source; re-renders before accept',
			inputContract: { kind: 'object', description: 'Frozen composer context plus optional targeted instruction' },
			outputContract: { kind: 'custom', description: 'text-patch replacing the mermaid block source' },
			permissionKind: 'read',
			costTier: 'fast',
			backendPolicy: { preferred: 'provider-direct', fallback: [] },
			skillRef: MERMAID_EDIT_CAPABILITY_ID,
			surfaceBinding: ['composer'],
		},
		version: '1',
		owner: 'composer-native',
		configKey: MERMAID_EDIT_CAPABILITY_ID,
		surfaces: ['block-row'],
		targetKinds: ['mermaid'],
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
			title: 'Edit diagram',
			description: 'Edit the Mermaid source with AI; re-renders before accept',
			lucideIcon: 'workflow',
			historyLabel: 'AI mermaid edit',
			order: 40,
		},
		evaluate: ({ snapshot }) => nonEmpty(snapshot, config().strings.emptyTarget),
		buildPromptVariables: (snapshot, instruction) =>
			buildEditPromptVariables(
				snapshot,
				instruction,
				'Edit this Mermaid diagram. Return the full ```mermaid code block, keeping it valid Mermaid syntax.',
			),
	};
}

export function createCodeEditDefinition(
	config: ComposerCapabilitiesConfigProvider,
): ComposerCapabilityDefinition {
	return {
		manifest: {
			id: CODE_EDIT_CAPABILITY_ID,
			title: 'Edit code',
			description: 'Rewrite or refactor the code block per instruction, kept as a fenced code block',
			inputContract: { kind: 'object', description: 'Frozen composer context plus optional targeted instruction' },
			outputContract: { kind: 'custom', description: 'text-patch replacing the code block' },
			permissionKind: 'read',
			costTier: 'fast',
			backendPolicy: { preferred: 'provider-direct', fallback: [] },
			skillRef: CODE_EDIT_CAPABILITY_ID,
			surfaceBinding: ['composer'],
		},
		version: '1',
		owner: 'composer-native',
		configKey: CODE_EDIT_CAPABILITY_ID,
		surfaces: ['block-row'],
		targetKinds: ['code'],
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
			title: 'Edit code',
			description: 'Rewrite or refactor the code with AI, kept as a fenced code block',
			lucideIcon: 'code',
			historyLabel: 'AI code edit',
			order: 42,
		},
		evaluate: ({ snapshot }) => nonEmpty(snapshot, config().strings.emptyTarget),
		buildPromptVariables: (snapshot, instruction) =>
			buildEditPromptVariables(
				snapshot,
				instruction,
				'Improve this code. Return the full fenced code block, preserving the language and indentation.',
			),
	};
}

export function createNativeCapabilityPack(
	config: ComposerCapabilitiesConfigProvider,
): ComposerCapabilityPack {
	return {
		id: 'composer-pack-native',
		definitions: () => [createMermaidEditDefinition(config), createCodeEditDefinition(config)],
	};
}
