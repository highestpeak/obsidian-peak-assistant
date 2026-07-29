/**
 * Peak Composer — native objects capability pack (WP8 + WP-INT, §10.11–10.13).
 *
 * Two rails live here:
 *
 * 1. Text-patch native edits (`composer.mermaid.edit`, `composer.code.edit`) —
 *    the model rewrites a ```mermaid or fenced code block's source; the result
 *    rides the shared text-patch rail (model-stream → text-patch → atomic block
 *    replace). WP-INT specialized these onto their OWN PromptIds
 *    (`DocMermaidEdit` / `DocCodeEdit`) instead of borrowing `DocPolish`.
 *
 * 2. Native STRUCTURAL edits (`composer.base.edit`, `composer.canvas.edit`,
 *    `composer.excalidraw.edit`) — the model emits a TYPED PATCH JSON bundle for
 *    a SEPARATE native object file (`.base` / `.canvas` / `.excalidraw.md`). The
 *    `native-file-patch` materializer validates the bundle, applies it through the
 *    WP8 typed-patch functions (never string-replace) to compute the next bytes,
 *    and carries a structured change summary for the review card. On accept the
 *    runtime writes it through the revision-guarded native-file port — NOT the
 *    Markdown transaction hub, because it targets a different file (handoff §10.12).
 *    All three share the one `DocNativeEdit` PromptId, disambiguated per format by
 *    `resultContext.format` (the fan-out precedent from the formula pack §5.1).
 */

import { PromptId } from '@/core/types/prompt';
import {
	COMPOSER_ANALYSIS_RENDERER_ID,
	COMPOSER_STREAMING_TEXT_RENDERER_ID,
	COMPOSER_NATIVE_FILE_PATCH_RENDERER_ID,
	COMPOSER_NATIVE_FILE_PATCH_WRITEBACK_ID,
	COMPOSER_TEXT_PATCH_WRITEBACK_ID,
	type ComposerCapabilityAvailability,
	type ComposerCapabilityDefinition,
	type ComposerCapabilityPack,
	type ComposerContextSnapshot,
	type ComposerOperation,
	type ComposerResultEnvelope,
} from '@/core/composer';
import {
	ComposerBaseFilePatchSchema,
	ComposerCanvasPatchSchema,
	ComposerExcalidrawPatchSchema,
	ComposerInstructionInputSchema,
	ComposerAnalysisPayloadSchema,
	ComposerNativeFilePatchPayloadSchema,
	ComposerNativePatchBundleSchema,
	ComposerTextPatchPayloadSchema,
	type ComposerNativeFileFormat,
	type ComposerNativeFilePatchPayload,
} from '@/core/schemas/composer';
import {
	DEFAULT_COMPOSER_CAPABILITIES_CONFIG,
	type ComposerCapabilitiesConfigProvider,
} from '../capabilityConfig';
import { parseTypedObjectJson, type ComposerResultMaterializer } from '../resultMaterializers';
import type { ComposerWritebackAdapter } from '../writebackAdapters';
import {
	patchNativeFile,
	type BaseFilePatch,
	type CanvasPatch,
	type ExcalidrawPatch,
	type NativeFilePatchRequest,
} from '../../packs/native';

export const MERMAID_EDIT_CAPABILITY_ID = 'composer.mermaid.edit';
export const MERMAID_EXPLAIN_CAPABILITY_ID = 'composer.mermaid.explain';
export const MERMAID_FILL_BRANCHES_CAPABILITY_ID = 'composer.mermaid.fill-branches';
export const CODE_EDIT_CAPABILITY_ID = 'composer.code.edit';
export const CODE_EXPLAIN_CAPABILITY_ID = 'composer.code.explain';
export const BASE_EDIT_CAPABILITY_ID = 'composer.base.edit';
export const CANVAS_EDIT_CAPABILITY_ID = 'composer.canvas.edit';
export const EXCALIDRAW_EDIT_CAPABILITY_ID = 'composer.excalidraw.edit';

function nonEmpty(
	snapshot: ComposerContextSnapshot,
	emptyReason: string,
): ComposerCapabilityAvailability {
	const content = snapshot.selectionText ?? snapshot.targetSource;
	if (content.trim().length === 0) return { state: 'disabled', reason: emptyReason };
	return { state: 'available' };
}

/** Extract the language token from a fenced code block's opening line, if any. */
function fencedLanguage(source: string): string | undefined {
	const match = /^\s*(?:```+|~~~+)([A-Za-z0-9_+\-]+)/.exec(source);
	return match ? match[1] : undefined;
}

function nativePresentation(id: string): ComposerCapabilityDefinition['presentationFallback'] {
	const presentation = DEFAULT_COMPOSER_CAPABILITIES_CONFIG.actions[id];
	if (
		typeof presentation?.title !== 'string' ||
		typeof presentation.description !== 'string' ||
		typeof presentation.lucideIcon !== 'string' ||
		typeof presentation.historyLabel !== 'string' ||
		typeof presentation.order !== 'number'
	) {
		throw new Error(`missing compiled Composer native presentation for '${id}'`);
	}
	return {
		title: presentation.title,
		description: presentation.description,
		lucideIcon: presentation.lucideIcon,
		historyLabel: presentation.historyLabel,
		order: presentation.order,
	};
}

interface NativeExplainSpec {
	id: string;
	kind: 'code' | 'mermaid';
}

function createNativeExplainDefinition(
	spec: NativeExplainSpec,
	config: ComposerCapabilitiesConfigProvider,
): ComposerCapabilityDefinition {
	const presentation = nativePresentation(spec.id);
	return {
		manifest: {
			id: spec.id,
			title: presentation.title,
			description: presentation.description,
			inputContract: { kind: 'object', description: 'Frozen native source plus an optional explanation focus' },
			outputContract: { kind: 'custom', description: 'read-only source explanation' },
			permissionKind: 'read',
			costTier: 'fast',
			backendPolicy: { preferred: 'provider-direct', fallback: [] },
			skillRef: spec.id,
			surfaceBinding: ['composer'],
		},
		version: '1',
		owner: 'composer-native',
		configKey: spec.id,
		surfaces: ['block-row'],
		targetKinds: [spec.kind],
		executionMode: 'model-stream',
		effectKind: 'analyze',
		promptId: PromptId.DocNativeExplain,
		inputSchema: ComposerInstructionInputSchema,
		resultSchema: ComposerAnalysisPayloadSchema,
		resultKind: 'analysis',
		rendererId: COMPOSER_ANALYSIS_RENDERER_ID,
		acceptsInstruction: true,
		presentationFallback: presentation,
		evaluate: ({ snapshot }) => nonEmpty(snapshot, config().strings.emptyTarget),
		buildPromptVariables: (snapshot, instruction) => ({
			content: snapshot.selectionText ?? snapshot.targetSource,
			nativeKind: spec.kind,
			...(spec.kind === 'code' && fencedLanguage(snapshot.targetSource)
				? { language: fencedLanguage(snapshot.targetSource) }
				: {}),
			...(instruction?.trim() ? { instruction } : {}),
		}),
	};
}

// ── Text-patch native edits (mermaid / code) ────────────────────────────────────

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
		promptId: PromptId.DocMermaidEdit,
		inputSchema: ComposerInstructionInputSchema,
		resultSchema: ComposerTextPatchPayloadSchema,
		resultKind: 'text-patch',
		rendererId: COMPOSER_STREAMING_TEXT_RENDERER_ID,
		writebackAdapterId: COMPOSER_TEXT_PATCH_WRITEBACK_ID,
		acceptsInstruction: true,
		presentationFallback: nativePresentation(MERMAID_EDIT_CAPABILITY_ID),
		evaluate: ({ snapshot }) => nonEmpty(snapshot, config().strings.emptyTarget),
		buildPromptVariables: (snapshot, instruction) => ({
			content: snapshot.selectionText ?? snapshot.targetSource,
			scope: snapshot.selectionText !== undefined ? 'selection' : 'full',
			...(instruction && instruction.trim() ? { instruction } : {}),
		}),
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
		promptId: PromptId.DocCodeEdit,
		inputSchema: ComposerInstructionInputSchema,
		resultSchema: ComposerTextPatchPayloadSchema,
		resultKind: 'text-patch',
		rendererId: COMPOSER_STREAMING_TEXT_RENDERER_ID,
		writebackAdapterId: COMPOSER_TEXT_PATCH_WRITEBACK_ID,
		acceptsInstruction: true,
		presentationFallback: nativePresentation(CODE_EDIT_CAPABILITY_ID),
		evaluate: ({ snapshot }) => nonEmpty(snapshot, config().strings.emptyTarget),
		buildPromptVariables: (snapshot, instruction) => {
			const content = snapshot.selectionText ?? snapshot.targetSource;
			const language = fencedLanguage(snapshot.targetSource);
			return {
				content,
				scope: snapshot.selectionText !== undefined ? 'selection' : 'full',
				...(language ? { language } : {}),
				...(instruction && instruction.trim() ? { instruction } : {}),
			};
		},
	};
}

export function createMermaidFillBranchesDefinition(
	config: ComposerCapabilitiesConfigProvider,
): ComposerCapabilityDefinition {
	const presentation = nativePresentation(MERMAID_FILL_BRANCHES_CAPABILITY_ID);
	return {
		manifest: {
			id: MERMAID_FILL_BRANCHES_CAPABILITY_ID,
			title: presentation.title,
			description: presentation.description,
			inputContract: { kind: 'object', description: 'Frozen Mermaid source plus an optional refinement instruction' },
			outputContract: { kind: 'custom', description: 'text-patch replacing the Mermaid source' },
			permissionKind: 'read',
			costTier: 'fast',
			backendPolicy: { preferred: 'provider-direct', fallback: [] },
			skillRef: MERMAID_FILL_BRANCHES_CAPABILITY_ID,
			surfaceBinding: ['composer'],
		},
		version: '1',
		owner: 'composer-native',
		configKey: MERMAID_FILL_BRANCHES_CAPABILITY_ID,
		surfaces: ['block-row'],
		targetKinds: ['mermaid'],
		executionMode: 'model-stream',
		effectKind: 'rewrite',
		promptId: PromptId.DocMermaidEdit,
		inputSchema: ComposerInstructionInputSchema,
		resultSchema: ComposerTextPatchPayloadSchema,
		resultKind: 'text-patch',
		rendererId: COMPOSER_STREAMING_TEXT_RENDERER_ID,
		writebackAdapterId: COMPOSER_TEXT_PATCH_WRITEBACK_ID,
		acceptsInstruction: true,
		presentationFallback: presentation,
		evaluate: ({ snapshot }) => nonEmpty(snapshot, config().strings.emptyTarget),
		buildPromptVariables: (snapshot, instruction) => ({
			content: snapshot.selectionText ?? snapshot.targetSource,
			scope: snapshot.selectionText !== undefined ? 'selection' : 'full',
			instruction: instruction?.trim() || config().instructions[MERMAID_FILL_BRANCHES_CAPABILITY_ID],
		}),
	};
}

// ── Native structural edits (base / canvas / excalidraw) ─────────────────────────

/** A structured, human-readable summary of one native structural patch bundle. */
export interface NativeChangeSummary {
	format: ComposerNativeFileFormat;
	/** One line per patch op, in application order. */
	ops: readonly string[];
}

/** Envelope payload for a `native-file-patch` result: accept core + review summary. */
export interface NativeFilePatchEnvelopePayload {
	/** Schema-validated core the accept path (native-file port write) consumes. */
	core: ComposerNativeFilePatchPayload;
	/** Structured change description for the review card. */
	summary: NativeChangeSummary;
}

/**
 * Pure mapping: a native format + its typed patches → readable per-op preview
 * lines. No I/O, no model — the renderer test drives this directly (goal 1).
 */
export function describeNativePatches(
	format: ComposerNativeFileFormat,
	patches: ReadonlyArray<BaseFilePatch | CanvasPatch | ExcalidrawPatch>,
): NativeChangeSummary {
	const ops = patches.map((p) => describeOne(format, p));
	return { format, ops };
}

function describeOne(
	format: ComposerNativeFileFormat,
	patch: BaseFilePatch | CanvasPatch | ExcalidrawPatch,
): string {
	if (format === 'base') return describeBase(patch as BaseFilePatch);
	if (format === 'canvas') return describeCanvas(patch as CanvasPatch);
	return describeExcalidraw(patch as ExcalidrawPatch);
}

function describeBase(p: BaseFilePatch): string {
	switch (p.op) {
		case 'rename-view':
			return `Rename view #${p.viewIndex} → “${p.name}”`;
		case 'add-order-column':
			return `Add column “${p.column}” to view #${p.viewIndex}`;
		case 'remove-order-column':
			return `Remove column “${p.column}” from view #${p.viewIndex}`;
		case 'set-formula':
			return `Set formula “${p.key}” on view #${p.viewIndex}`;
		case 'remove-formula':
			return `Remove formula “${p.key}” from view #${p.viewIndex}`;
		case 'set-field':
			return `Set field ${p.path.join('.')}`;
	}
}

function describeCanvas(p: CanvasPatch): string {
	switch (p.op) {
		case 'move-node':
			return `Move node ${p.id} → (${p.x}, ${p.y})`;
		case 'nudge-node':
			return `Nudge node ${p.id} by (${p.dx}, ${p.dy})`;
		case 'set-node-text':
			return `Set text of node ${p.id}`;
		case 'set-node-label':
			return `Set label of node ${p.id}`;
		case 'set-node-color':
			return `Set color of node ${p.id}`;
		case 'add-edge':
			return `Add edge ${p.edge.fromNode} → ${p.edge.toNode}`;
		case 'remove-edge':
			return `Remove edge ${p.id}`;
		case 'remove-node':
			return `Remove node ${p.id}`;
	}
}

function describeExcalidraw(p: ExcalidrawPatch): string {
	switch (p.op) {
		case 'set-background':
			return `Set background color ${p.color}`;
		case 'add-element':
			return `Add ${p.element.type} element`;
		case 'remove-element':
			return `Remove element ${p.id}`;
		case 'set-scene-field':
			return `Set scene field ${p.path.join('.')}`;
	}
}

/** Validate the bundle's patches against the ONE schema matching `format`. */
function narrowPatches(
	format: ComposerNativeFileFormat,
	patches: readonly unknown[],
): NativeFilePatchRequest {
	if (format === 'base') {
		return { format, patches: patches.map((p) => ComposerBaseFilePatchSchema.parse(p) as BaseFilePatch) };
	}
	if (format === 'canvas') {
		return { format, patches: patches.map((p) => ComposerCanvasPatchSchema.parse(p) as CanvasPatch) };
	}
	return { format, patches: patches.map((p) => ComposerExcalidrawPatchSchema.parse(p) as ExcalidrawPatch) };
}

/**
 * `native-file-patch` materializer: parse the streamed typed-patch JSON, narrow
 * it to the definition's format, apply it against the native file's frozen base
 * bytes through the WP8 typed-patch functions, and carry BOTH the accept core
 * (format / targetPath / nextText | unsupported+reason) and a structured summary.
 * Fails CLOSED — a compressed-json Excalidraw variant or an out-of-range patch
 * lands as `unsupported` rather than corrupting the file.
 */
export function createNativeFilePatchMaterializer(): ComposerResultMaterializer {
	return {
		resultKind: 'native-file-patch',
		streamsTypedObject: true,
		materialize({ definition, text, nativeBaseText, nativeTargetPath }): ComposerResultEnvelope<NativeFilePatchEnvelopePayload> {
			const format = definition.resultContext?.format as ComposerNativeFileFormat | undefined;
			if (!format) throw new Error('native-file-patch: definition is missing resultContext.format');
			const targetPath = nativeTargetPath ?? '';
			const bundle = ComposerNativePatchBundleSchema.parse(parseTypedObjectJson(text, 'native-file-patch'));
			const request = narrowPatches(format, bundle.patches);
			const summary = describeNativePatches(format, request.patches);
			const core = buildNativeCore(format, targetPath, nativeBaseText, request);
			return {
				resultKind: 'native-file-patch',
				rendererId: definition.rendererId,
				...(definition.writebackAdapterId !== undefined
					? { writebackAdapterId: definition.writebackAdapterId }
					: {}),
				payload: { core, summary },
			};
		},
	};
}

function buildNativeCore(
	format: ComposerNativeFileFormat,
	targetPath: string,
	nativeBaseText: string | undefined,
	request: NativeFilePatchRequest,
): ComposerNativeFilePatchPayload {
	if (nativeBaseText === undefined) {
		return ComposerNativeFilePatchPayloadSchema.parse({
			format,
			targetPath,
			unsupported: true,
			reason: 'native object source is unavailable (no native-file port)',
		});
	}
	const outcome = patchNativeFile(nativeBaseText, request);
	const core = outcome.ok
		? { format, targetPath, nextText: outcome.nextText }
		: { format, targetPath, unsupported: true, reason: outcome.reason };
	return ComposerNativeFilePatchPayloadSchema.parse(core);
}

/**
 * `native-file-patch` writeback: a MARKER that produces no Markdown operations —
 * a native patch targets a SEPARATE file, so the runtime writes it through the
 * revision-guarded native-file port on accept. Registered so `validateBindings`
 * sees a complete chain for the `native-file-patch` result kind.
 */
export function createNativeFilePatchWritebackAdapter(): ComposerWritebackAdapter {
	return {
		id: COMPOSER_NATIVE_FILE_PATCH_WRITEBACK_ID,
		resultKinds: ['native-file-patch'],
		buildOperations(): ComposerOperation[] {
			return [];
		},
	};
}

interface NativeDefSpec {
	id: string;
	format: ComposerNativeFileFormat;
	title: string;
	description: string;
	lucideIcon: string;
	historyLabel: string;
	order: number;
}

function createNativeStructuralDefinition(
	spec: NativeDefSpec,
	config: ComposerCapabilitiesConfigProvider,
): ComposerCapabilityDefinition {
	return {
		manifest: {
			id: spec.id,
			title: spec.title,
			description: spec.description,
			inputContract: { kind: 'object', description: 'Frozen composer context plus optional targeted instruction' },
			outputContract: { kind: 'custom', description: 'typed native-file patch candidate' },
			permissionKind: 'read',
			costTier: 'fast',
			backendPolicy: { preferred: 'provider-direct', fallback: [] },
			skillRef: spec.id,
			surfaceBinding: ['composer'],
		},
		version: '1',
		owner: 'composer-native',
		configKey: spec.id,
		surfaces: ['block-row'],
		// The native object is hosted by a Markdown embed block; the runtime gates
		// each format to its own native ref (and to the presence of the native-file
		// port) in `actionsFor`, so only the matching format ever projects.
		targetKinds: ['embed', 'base', 'canvas', 'excalidraw'],
		executionMode: 'model-stream',
		effectKind: 'native-object-patch',
		promptId: PromptId.DocNativeEdit,
		inputSchema: ComposerInstructionInputSchema,
		resultSchema: ComposerNativeFilePatchPayloadSchema,
		resultKind: 'native-file-patch',
		resultContext: { format: spec.format },
		rendererId: COMPOSER_NATIVE_FILE_PATCH_RENDERER_ID,
		writebackAdapterId: COMPOSER_NATIVE_FILE_PATCH_WRITEBACK_ID,
		acceptsInstruction: true,
		presentationFallback: {
			title: spec.title,
			description: spec.description,
			lucideIcon: spec.lucideIcon,
			historyLabel: spec.historyLabel,
			order: spec.order,
		},
		// Real availability (native ref of matching format + port present) is decided
		// by the runtime; here we only reject an empty target.
		evaluate: ({ snapshot }) => nonEmpty(snapshot, config().strings.emptyTarget),
		buildPromptVariables: (snapshot, instruction, extras) => ({
			format: spec.format,
			native: extras?.nativeText ?? '',
			...(instruction && instruction.trim() ? { instruction } : {}),
		}),
	};
}

export const NATIVE_STRUCTURAL_SPECS: readonly NativeDefSpec[] = [
	{
		id: BASE_EDIT_CAPABILITY_ID,
		format: 'base',
		title: 'Edit base',
		description: 'Restructure this Base view (columns, formulas, filters) with AI',
		lucideIcon: 'database',
		historyLabel: 'AI base edit',
		order: 46,
	},
	{
		id: CANVAS_EDIT_CAPABILITY_ID,
		format: 'canvas',
		title: 'Edit canvas',
		description: 'Edit this Canvas structure (nodes, edges, labels) with AI',
		lucideIcon: 'layout-dashboard',
		historyLabel: 'AI canvas edit',
		order: 47,
	},
	{
		id: EXCALIDRAW_EDIT_CAPABILITY_ID,
		format: 'excalidraw',
		title: 'Edit drawing',
		description: 'Edit this Excalidraw scene (elements, background) with AI',
		lucideIcon: 'pen-tool',
		historyLabel: 'AI drawing edit',
		order: 48,
	},
] as const;

export function createNativeCapabilityPack(
	config: ComposerCapabilitiesConfigProvider,
): ComposerCapabilityPack {
	return {
		id: 'composer-pack-native',
		definitions: () => [
			createNativeExplainDefinition({ id: MERMAID_EXPLAIN_CAPABILITY_ID, kind: 'mermaid' }, config),
			createMermaidEditDefinition(config),
			createMermaidFillBranchesDefinition(config),
			createNativeExplainDefinition({ id: CODE_EXPLAIN_CAPABILITY_ID, kind: 'code' }, config),
			createCodeEditDefinition(config),
			...NATIVE_STRUCTURAL_SPECS.map((spec) => createNativeStructuralDefinition(spec, config)),
		],
	};
}
