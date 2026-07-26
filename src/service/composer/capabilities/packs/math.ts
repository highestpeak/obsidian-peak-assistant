/**
 * Peak Composer — math (formula) capability pack (WP5, handoff §10.2 / §3.3).
 *
 * Three INDEPENDENT formula detail capabilities — explain / split / variables.
 * The owner decision (§3.3) is that these never merge and never form a global
 * accordion: each is its own analyze result, any combination can be open on one
 * formula and across formulas, and clicking one shows only that one. They share
 * the `formula-annotation` result kind; the per-definition `resultContext`
 * carries the `detailKind` the materializer/renderer dispatch on.
 *
 * All three are `analyze` (accept-keep-annotation / close — §10.2), so they have
 * no writeback adapter; the formula-detail store owns their independent display
 * state, variant history and follow-up regeneration.
 */

import { PromptId } from '@/core/types/prompt';
import {
	COMPOSER_FORMULA_ANNOTATION_RENDERER_ID,
	type ComposerCapabilityAvailability,
	type ComposerCapabilityDefinition,
	type ComposerCapabilityPack,
	type ComposerContextSnapshot,
} from '@/core/composer';
import type { ComposerFormulaDetailKind } from '@/core/schemas/composer';
import {
	ComposerFormulaAnnotationPayloadSchema,
	ComposerInstructionInputSchema,
} from '@/core/schemas/composer';
import { latexFromSource } from '@/service/composer/packs/math/formulaMaterializer';
import type { ComposerCapabilitiesConfigProvider } from '../capabilityConfig';

interface DetailSpec {
	id: string;
	detailKind: ComposerFormulaDetailKind;
	promptId: PromptId;
	title: string;
	description: string;
	historyLabel: string;
	order: number;
}

const DETAILS: readonly DetailSpec[] = [
	{
		id: 'composer.math.explain',
		detailKind: 'explain',
		promptId: PromptId.ComposerExplainFormula,
		title: '解释公式',
		description: '用自然语言解释这条公式的含义',
		historyLabel: '公式解释',
		order: 10,
	},
	{
		id: 'composer.math.split',
		detailKind: 'split',
		promptId: PromptId.ComposerSplitFormula,
		title: '拆分公式',
		description: '把公式拆成可逐项理解的组成部分',
		historyLabel: '公式拆分',
		order: 20,
	},
	{
		id: 'composer.math.variables',
		detailKind: 'variables',
		promptId: PromptId.ComposerFormulaVariables,
		title: '变量表',
		description: '列出公式中每个符号的含义',
		historyLabel: '变量表',
		order: 30,
	},
];

export interface FormulaDetailPromptInput {
	latex: string;
	label?: string;
	instruction?: string;
}

export function buildFormulaDetailPromptVariables(input: FormulaDetailPromptInput): Record<string, unknown> {
	return {
		latex: input.latex,
		...(input.label !== undefined ? { label: input.label } : {}),
		...(input.instruction !== undefined ? { instruction: input.instruction } : {}),
	};
}

function evaluateFormula(
	snapshot: ComposerContextSnapshot,
	emptyReason: string,
): ComposerCapabilityAvailability {
	if (latexFromSource(snapshot.targetSource).length === 0) {
		return { state: 'disabled', reason: emptyReason };
	}
	return { state: 'available' };
}

function createFormulaDetailDefinition(
	spec: DetailSpec,
	config: ComposerCapabilitiesConfigProvider,
): ComposerCapabilityDefinition {
	return {
		manifest: {
			id: spec.id,
			title: spec.title,
			description: spec.description,
			inputContract: { kind: 'object', description: 'Frozen formula latex plus optional instruction' },
			outputContract: { kind: 'custom', description: 'formula-annotation result' },
			permissionKind: 'read',
			costTier: 'fast',
			backendPolicy: { preferred: 'provider-direct', fallback: [] },
			skillRef: spec.id,
			surfaceBinding: ['composer'],
		},
		version: '1',
		owner: 'composer-math',
		configKey: spec.id,
		// object-toolbar only: the formula micro-block (MathBlockView) owns these,
		// so they never double-surface in the generic block-row action row. The
		// independent-detail model (§3.3) cannot be expressed by the single-candidate
		// block-row host, so math AI is driven by the bespoke formula-detail store.
		surfaces: ['object-toolbar'],
		targetKinds: ['math'],
		executionMode: 'model-stream',
		effectKind: 'analyze',
		promptId: spec.promptId,
		inputSchema: ComposerInstructionInputSchema,
		resultSchema: ComposerFormulaAnnotationPayloadSchema,
		resultKind: 'formula-annotation',
		resultContext: { detailKind: spec.detailKind },
		rendererId: COMPOSER_FORMULA_ANNOTATION_RENDERER_ID,
		acceptsInstruction: true,
		presentationFallback: {
			title: spec.title,
			description: spec.description,
			lucideIcon: 'sparkles',
			historyLabel: spec.historyLabel,
			order: spec.order,
		},
		evaluate: ({ snapshot }) => evaluateFormula(snapshot, config().strings.emptyTarget),
		buildPromptVariables: (snapshot, instruction) =>
			buildFormulaDetailPromptVariables({
				latex: latexFromSource(snapshot.targetSource),
				...(instruction !== undefined ? { instruction } : {}),
			}),
	};
}

/** Capability id → detail kind, for surfaces that resolve a run's detail layout. */
export function formulaDetailKindOf(capabilityId: string): ComposerFormulaDetailKind | null {
	return DETAILS.find((d) => d.id === capabilityId)?.detailKind ?? null;
}

export function createMathCapabilityPack(
	config: ComposerCapabilitiesConfigProvider,
): ComposerCapabilityPack {
	return {
		id: 'composer-pack-math',
		definitions: () => DETAILS.map((spec) => createFormulaDetailDefinition(spec, config)),
	};
}
