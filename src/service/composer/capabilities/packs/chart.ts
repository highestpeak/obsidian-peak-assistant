/**
 * Peak Composer — chart capability pack (WP6, handoff §10.6).
 *
 * `generate chart` (table→chart) plus the typed `chart-source` result plumbing.
 * A generated chart is an INDEPENDENT pending block: on accept the writeback
 * inserts a fenced ```chart block below the table (it never rewrites the table),
 * so the chart and its source table never re-render each other.
 *
 * Two invocation paths share this typed plumbing: the DETERMINISTIC table
 * toolbar (empty streamed text ⇒ the spec is derived from the frozen table) and
 * the MODEL path (WP-INT), where `generate-chart` streams a chart-source JSON
 * spec bound to its PromptId. Either way the result is one typed `chart-source`
 * envelope inserted as an independent block below the table.
 */

import type {
	ComposerCapabilityAvailability,
	ComposerCapabilityDefinition,
	ComposerCapabilityPack,
	ComposerContextSnapshot,
	ComposerOperation,
	ComposerRendererId,
	ComposerResultEnvelope,
	ComposerWritebackAdapterId,
} from '@/core/composer';
import { COMPOSER_STREAMING_TEXT_RENDERER_ID } from '@/core/composer';
import { PromptId } from '@/core/types/prompt';
import {
	ComposerChartSourcePayloadSchema,
	ComposerInstructionInputSchema,
	type ComposerChartSourcePayload,
} from '@/core/schemas/composer';
import type { ComposerCapabilitiesConfigProvider } from '../capabilityConfig';
import { parseTypedObjectJson, type ComposerResultMaterializer } from '../resultMaterializers';
import type { ComposerWritebackAdapter } from '../writebackAdapters';
import { chartSpecToFencedSource, tableToChartSpec } from '../../packs/chart';
import { parseTableSource } from './table';

export const COMPOSER_CHART_SOURCE_WRITEBACK_ID: ComposerWritebackAdapterId = 'composer.writeback.chart-source';
export const COMPOSER_CHART_SOURCE_RENDERER_ID: ComposerRendererId = COMPOSER_STREAMING_TEXT_RENDERER_ID;

export interface ChartSourceEnvelopePayload {
	spec: ComposerChartSourcePayload;
	/** The fenced ```chart block to insert below the source table. */
	fencedSource: string;
}

/**
 * Materialize a chart spec. The streamed text may be the JSON spec directly (AI
 * path) OR empty, in which case the spec is derived deterministically from the
 * frozen table source (deterministic path).
 */
export function createChartSourceMaterializer(): ComposerResultMaterializer {
	return {
		resultKind: 'chart-source',
		streamsTypedObject: true,
		materialize({ definition, snapshot, text }): ComposerResultEnvelope<ChartSourceEnvelopePayload> {
			const spec = resolveChartSpec(snapshot, text);
			return {
				resultKind: 'chart-source',
				rendererId: definition.rendererId,
				...(definition.writebackAdapterId !== undefined
					? { writebackAdapterId: definition.writebackAdapterId }
					: {}),
				payload: { spec, fencedSource: chartSpecToFencedSource(spec) },
			};
		},
	};
}

function resolveChartSpec(snapshot: ComposerContextSnapshot, text: string): ComposerChartSourcePayload {
	// Model path: a streamed chart-source JSON spec (may be ```json fenced).
	if (text.trim().length > 0) {
		return ComposerChartSourcePayloadSchema.parse(parseTypedObjectJson(text, 'chart-source'));
	}
	// Deterministic path: derive the spec from the frozen table source.
	const derived = tableToChartSpec(parseTableSource(snapshot.targetSource));
	if (!derived.ok) throw new Error(`generate chart: ${derived.reason}`);
	return derived.spec;
}

/** Writeback: insert the fenced chart block immediately after the table span. */
export function createChartSourceWritebackAdapter(): ComposerWritebackAdapter {
	return {
		id: COMPOSER_CHART_SOURCE_WRITEBACK_ID,
		resultKinds: ['chart-source'],
		buildOperations(envelope, ctx): ComposerOperation[] {
			const payload = envelope.payload as ChartSourceEnvelopePayload;
			if (!ctx.anchor) {
				throw new Error('chart-source writeback: no source anchor for target — refusing to guess a position');
			}
			return [
				{ kind: 'insertBlock', at: ctx.anchor.to, text: '\n\n' + payload.fencedSource, blockKind: 'code' },
			];
		},
	};
}

// ── generate-chart capability definition ─────────────────────────────────────────

function chartAvailable(snapshot: ComposerContextSnapshot, emptyReason: string): ComposerCapabilityAvailability {
	if (snapshot.targetSource.trim().length === 0) return { state: 'disabled', reason: emptyReason };
	return { state: 'available' };
}

export const GENERATE_CHART_CAPABILITY_ID = 'composer.table.generate-chart';

export function createGenerateChartDefinition(
	config: ComposerCapabilitiesConfigProvider,
): ComposerCapabilityDefinition {
	return {
		manifest: {
			id: GENERATE_CHART_CAPABILITY_ID,
			title: 'Generate chart',
			description: 'Create a chart from the table data',
			inputContract: { kind: 'object', description: 'Frozen table context plus optional instruction' },
			outputContract: { kind: 'custom', description: 'chart-source candidate (fenced chart block)' },
			permissionKind: 'read',
			costTier: 'fast',
			backendPolicy: { preferred: 'provider-direct', fallback: [] },
			skillRef: GENERATE_CHART_CAPABILITY_ID,
			surfaceBinding: ['composer'],
		},
		version: '1',
		owner: 'composer-chart',
		configKey: GENERATE_CHART_CAPABILITY_ID,
		// The deterministic chart shortcut stays in the top object toolbar; the
		// model-backed chart capability belongs to the shared bottom action row.
		surfaces: ['block-row'],
		targetKinds: ['table'],
		// Model path: the model streams a chart-source JSON spec. (The
		// deterministic table toolbar still derives the same spec directly.)
		executionMode: 'model-stream',
		effectKind: 'insert',
		promptId: PromptId.DocTableGenerateChart,
		inputSchema: ComposerInstructionInputSchema,
		resultSchema: ComposerChartSourcePayloadSchema,
		resultKind: 'chart-source',
		rendererId: COMPOSER_CHART_SOURCE_RENDERER_ID,
		writebackAdapterId: COMPOSER_CHART_SOURCE_WRITEBACK_ID,
		acceptsInstruction: true,
		presentationFallback: {
			title: 'Generate chart',
			description: 'Create a chart from the table data',
			lucideIcon: 'bar-chart-3',
			historyLabel: 'Generate chart',
			order: 65,
		},
		evaluate: ({ snapshot }) => chartAvailable(snapshot, config().strings.emptyTarget),
		buildPromptVariables: (snapshot, instruction) => ({
			table: snapshot.targetSource,
			...(instruction !== undefined ? { instruction } : {}),
		}),
	};
}

export function createChartCapabilityPack(config: ComposerCapabilitiesConfigProvider): ComposerCapabilityPack {
	return {
		id: 'composer-pack-chart',
		definitions: () => [createGenerateChartDefinition(config)],
	};
}
