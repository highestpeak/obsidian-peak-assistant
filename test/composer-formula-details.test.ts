/**
 * Peak Composer — formula pack (WP5, CMP-MATH-01..05).
 *
 * Covers the framework-neutral formula pack:
 *   - formula parsing: one `$$…$$` per formula, byte ranges, derived labels
 *     (CMP-MATH-01);
 *   - the INDEPENDENT detail state model (§3.3): three details per formula, any
 *     combination open, cross-formula coexistence, ZERO global accordion,
 *     "click one shows only that one", per-detail variant history
 *     (CMP-MATH-02/03);
 *   - copy payloads in four formats — plain / latex / html(+MathML) (CMP-MATH-04);
 *   - annotation materialization incl. variable-table parsing (CMP-MATH-05).
 */

import {
	parseFormulaBlock,
	deriveFormulaLabel,
	buildFormulaCopyPayloads,
	FORMULA_COPY_ORDER,
	buildFormulaAnnotationPayload,
	buildFormulaSplitMarkdown,
	buildFormulaSplitPatch,
	buildFormulaContext,
	parseComposerDocument,
	latexFromSource,
	formulaDetailKindOf,
	formulaDetailCapabilityForKind,
	EMPTY_FORMULA_DETAIL_STATE,
	openDetail,
	closeDetail,
	keepDetail,
	regenerate,
	setActiveVariant,
	appendDelta,
	markVariantReady,
	openKinds,
	visibleDetails,
	isDetailOpen,
	getDetail,
	activeVariant,
} from '@/service/composer';
import type { ComposerFormulaAnnotationPayload } from '@/core/schemas/composer';
import { makeChecker } from './helpers/composer-fakes';

const { check, done } = makeChecker();

const BLOCK = [
	'$$PR(A) = \\frac{1-d}{N} + d \\sum_{i \\in In(A)} \\frac{PR(i)}{L(i)}$$',
	'',
	'$$WS(V_i)=(1-d)+d\\sum w_{ji}$$',
	'',
	'$$\\Delta Q=\\frac{k}{2m}$$',
].join('\n');

function testParse(): void {
	const formulas = parseFormulaBlock(BLOCK);
	check('three formulas parsed', formulas.length === 3, String(formulas.length));
	check('ids stable-within-block', formulas.map((f) => f.id).join(',') === 'f0,f1,f2');
	check('latex delimiters stripped', formulas[0].latex.startsWith('PR(A)') && !formulas[0].latex.includes('$$'));
	// ranges address the exact segment
	for (const f of formulas) {
		check(`range slices back to segment (${f.id})`, BLOCK.slice(f.from, f.to) === `$$${f.latex}$$` || BLOCK.slice(f.from, f.to).includes(f.latex));
	}
	check('ranges are disjoint + ordered', formulas[0].to <= formulas[1].from && formulas[1].to <= formulas[2].from);
	check('label derived from head', formulas[0].label === 'PR(A)');

	check('empty label fallback', deriveFormulaLabel('x + y', 4) === 'Formula 5');
	check('single formula block', parseFormulaBlock('$$a=b$$').length === 1);
	check('latexFromSource strips fences', latexFromSource('$$ a=b $$') === 'a=b');
}

// ── the coexistence matrix (§3.3 — the owner-decisive property) ──────────────

function testIndependentCoexistence(): void {
	let s = EMPTY_FORMULA_DETAIL_STATE;
	// Open all three details on f0.
	s = openDetail(s, 'f0', 'explain', 'v-e0');
	s = openDetail(s, 'f0', 'split', 'v-s0');
	s = openDetail(s, 'f0', 'variables', 'v-v0');
	check('f0 has all three open simultaneously', openKinds(s, 'f0').sort().join(',') === 'explain,split,variables');

	// Open variables on f1 — different formula, coexists.
	s = openDetail(s, 'f1', 'variables', 'v-v1');
	check('f1 variables open independently', isDetailOpen(s, 'f1', 'variables') && openKinds(s, 'f1').join(',') === 'variables');
	check('opening f1 did NOT touch f0 (no global accordion)', openKinds(s, 'f0').length === 3);
	check('total visible = 4', visibleDetails(s).length === 4);

	// "Click PageRank variables shows PageRank only": the f1 variables entry is
	// scoped to f1, never merges f0's.
	check('f1 variables entry is f1-scoped', getDetail(s, 'f1', 'variables')?.formulaId === 'f1');
	check('f0 variables entry is f0-scoped', getDetail(s, 'f0', 'variables')?.formulaId === 'f0');

	// Close ONE detail on f0 — others unaffected.
	s = closeDetail(s, 'f0', 'split');
	check('closing f0 split leaves f0 explain+variables', openKinds(s, 'f0').sort().join(',') === 'explain,variables');
	check('closing f0 split did not touch f1', isDetailOpen(s, 'f1', 'variables'));
	check('non-kept close discards the entry', getDetail(s, 'f0', 'split') === undefined);

	// keep → close retains the annotation (collapsed, reopenable).
	s = keepDetail(s, 'f0', 'explain');
	s = closeDetail(s, 'f0', 'explain');
	check('kept detail survives close (collapsed)', getDetail(s, 'f0', 'explain') !== undefined && !isDetailOpen(s, 'f0', 'explain'));
	s = openDetail(s, 'f0', 'explain', 'v-ignored');
	check('reopening kept detail keeps its history (no new variant)', getDetail(s, 'f0', 'explain')?.variants[0].variantId === 'v-e0');
}

function testVariantHistory(): void {
	let s = EMPTY_FORMULA_DETAIL_STATE;
	s = openDetail(s, 'f2', 'explain', 'v0');
	s = appendDelta(s, 'f2', 'explain', 'v0', 'The formula ');
	s = appendDelta(s, 'f2', 'explain', 'v0', 'computes X.');
	const v0Text = activeVariant(getDetail(s, 'f2', 'explain'))?.streamingText;
	check('deltas accumulate', v0Text === 'The formula computes X.');
	s = markVariantReady(s, 'f2', 'explain', 'v0', {
		detailKind: 'explain',
		latex: 'x',
		summary: 'done',
		terms: [{ symbolTex: 'x', meaning: 'value' }],
	});
	check('variant marked ready', activeVariant(getDetail(s, 'f2', 'explain'))?.status === 'ready');

	// Targeted follow-up → new variant, previous kept as history, active switches.
	s = regenerate(s, 'f2', 'explain', 'v1', 'be more concise');
	const entry = getDetail(s, 'f2', 'explain');
	check('regenerate appends variant history', entry?.variants.length === 2 && entry?.activeVariantId === 'v1');
	check('follow-up instruction frozen into variant', entry?.variants[1].instruction === 'be more concise');

	// Navigate back to the first variant.
	s = setActiveVariant(s, 'f2', 'explain', 'v0');
	check('variant navigation switches active', getDetail(s, 'f2', 'explain')?.activeVariantId === 'v0');

	// Regenerate on f2.explain does NOT affect an f2.variables detail.
	s = openDetail(s, 'f2', 'variables', 'vv0');
	s = regenerate(s, 'f2', 'explain', 'v2');
	check('regenerate is detail-scoped', getDetail(s, 'f2', 'variables')?.variants.length === 1);
}

function testCopyPayloads(): void {
	check('copy order fixed', FORMULA_COPY_ORDER.join(',') === 'plain,latex,html,image');
	const payloads = buildFormulaCopyPayloads('PR(A)=\\frac{1-d}{N}');
	check('latex verbatim', payloads.latex === 'PR(A)=\\frac{1-d}{N}');
	check('plain de-texs frac', payloads.plain.includes('(1-d)/(N)') && !payloads.plain.includes('\\frac'));
	check('html has katex + mathml', payloads.html.includes('class="katex"') && payloads.html.includes('<math'));
	check('html is self-contained (no external src)', !/src=|href=http/.test(payloads.html));
}

function testAnnotation(): void {
	const explain = buildFormulaAnnotationPayload('explain', 'a=b', JSON.stringify({
		summary: 'This means a equals b.',
		terms: [{ symbolTex: 'a', meaning: 'left-hand value' }],
	}));
	check(
		'explain payload is a typed term map',
		explain.detailKind === 'explain' &&
			explain.summary === 'This means a equals b.' &&
			explain.terms[0].symbolTex === 'a',
	);

	const variablesJson = JSON.stringify({
		variables: [
			{ symbolTex: 'PR(A)', role: 'output', meaning: 'PageRank of node A' },
			{ symbolTex: 'd', role: 'parameter', meaning: 'damping factor' },
			{ symbolTex: 'N', role: 'normalization', meaning: 'total number of nodes' },
		],
	});
	const varPayload: ComposerFormulaAnnotationPayload = buildFormulaAnnotationPayload(
		'variables',
		'x',
		`\`\`\`json\n${variablesJson}\n\`\`\``,
	);
	check(
		'variables payload carries exhaustive typed rows',
		varPayload.detailKind === 'variables' &&
			varPayload.variables.length === 3 &&
			varPayload.variables[0].symbolTex === 'PR(A)' &&
			varPayload.variables[0].role === 'output',
	);

	const split = buildFormulaAnnotationPayload('split', 'PR(A)=x+y', JSON.stringify({
		equivalentTex: '$$PR(A)=B+V(A)$$',
		parts: [
			{ label: 'Base', tex: '$$B=x$$', contribution: 'minimum probability' },
			{ label: 'Vote', tex: 'V(A)=y', contribution: 'link contribution' },
		],
	}));
	check(
		'split payload strips display delimiters from every math field',
		split.detailKind === 'split' &&
			split.equivalentTex === 'PR(A)=B+V(A)' &&
			split.parts[0].tex === 'B=x',
	);
	if (split.detailKind === 'split') {
		const markdown = buildFormulaSplitMarkdown(split);
		check('accepted split is one standard display formula', markdown.startsWith('$$\n\\begin{aligned}\n'));
		check('accepted split defines every introduced component', markdown.includes('B=x') && markdown.includes('V(A)=y'));
		check('accepted split keeps aligned rows', markdown.includes('PR(A)=B+V(A) \\\\'));
		const formula = parseFormulaBlock('$$PR(A)=x+y$$')[0];
		const patch = buildFormulaSplitPatch('math-1', 100, formula, split);
		check(
			'split patch targets exactly one formula range',
			patch.target.kind === 'selection' &&
				patch.target.from === 100 + formula.from &&
				patch.target.to === 100 + formula.to &&
				patch.operations[0].kind === 'replaceRange',
		);
		check('split patch preserves top-level block count', patch.expectedBlockDelta === 0);
	}

	let invalidFailed = false;
	try {
		buildFormulaAnnotationPayload('explain', 'a=b', '**not structured**');
	} catch {
		invalidFailed = true;
	}
	check('invalid model formatting fails closed', invalidFailed);
}

function testContextHint(): void {
	const snapshot = parseComposerDocument([
		'# 图算法',
		'',
		'这是 PageRank 的中文背景说明。',
		'',
		'$$PR(A)=x+y$$',
		'',
		'下一段继续解释阻尼系数。',
	].join('\n'));
	const math = snapshot.blocks.find((block) => block.kind === 'math');
	check('math fixture parsed for context hint', Boolean(math));
	const context = buildFormulaContext(snapshot, math?.blockId ?? '', 1200);
	check(
		'context hint includes neighboring Chinese prose but not target LaTeX',
		Boolean(context?.includes('中文背景说明') && context.includes('阻尼系数') && !context.includes('PR(A)=x+y')),
	);
}

// ── detail kind ⇄ capability binding (generator routing) ─────────────────────

function testDetailCapabilityBinding(): void {
	// The generator maps a detail kind to its capability id + PromptId; the
	// reverse (capability id → kind) round-trips, so the store, pack and executor
	// agree on which of the three independent details a run belongs to.
	for (const kind of ['explain', 'split', 'variables'] as const) {
		const cap = formulaDetailCapabilityForKind(kind);
		check(`capability for ${kind} resolves`, cap !== null && cap.capabilityId.length > 0 && cap.promptId.length > 0);
		check(`capability round-trips for ${kind}`, cap !== null && formulaDetailKindOf(cap.capabilityId) === kind);
	}
	check('explain capability id is stable', formulaDetailCapabilityForKind('explain')?.capabilityId === 'composer.math.explain');
}

testParse();
testDetailCapabilityBinding();
testIndependentCoexistence();
testVariantHistory();
testCopyPayloads();
testAnnotation();
testContextHint();
done('composer-formula-details');
