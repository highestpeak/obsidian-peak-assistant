import {
	activeVariant,
	buildFormulaAnnotationPayload,
	buildFormulaSplitPatch,
	parseFormulaBlock,
} from '@/service/composer';
import {
	createFormulaDetailStore,
	type FormulaDetailRequest,
	type FormulaDetailStreamEvent,
} from '@/ui/view/composer/blocks/math/formulaDetailStore';
import { FakeVault, makeChecker, makeHub, openSession } from './helpers/composer-fakes';

const { check, done } = makeChecker();

async function testStructuredStreamingStore(): Promise<void> {
	let captured: FormulaDetailRequest | null = null;
	const store = createFormulaDetailStore({
		async *stream(request: FormulaDetailRequest): AsyncGenerator<FormulaDetailStreamEvent> {
			captured = request;
			yield { type: 'text-delta', text: '{"summary":"Balances two terms","terms":[' };
			yield { type: 'text-delta', text: '{"symbolTex":"x","meaning":"base value"}]}' };
			yield { type: 'complete' };
		},
	});
	store.getState().toggle('f0', 'explain', 'y=x+z', 'y', '中文公式背景');
	await new Promise((resolve) => setTimeout(resolve, 0));
	const entry = store.getState().model.entries['f0::explain'];
	const payload = activeVariant(entry)?.payload;
	check('store materializes streamed JSON into a ready typed payload', payload?.detailKind === 'explain');
	check(
		'store passes nearby language context without widening formula identity',
		captured?.contextText === '中文公式背景' && captured?.latex === 'y=x+z',
	);
	check(
		'store never promotes transport JSON to the typed term meaning',
		payload?.detailKind === 'explain' && payload.terms[0].meaning === 'base value',
	);
}

async function testSplitCommitAndUndo(): Promise<void> {
	const source = '# Formula\n\n$$PR(A)=x+y$$\n';
	const vault = new FakeVault();
	const session = openSession(vault, 'formula.md', source);
	const hub = makeHub(vault, session);
	const block = session.snapshot.blocks.find((item) => item.kind === 'math');
	if (!block) throw new Error('math block missing');
	const formula = parseFormulaBlock(block.renderModel.raw)[0];
	const payload = buildFormulaAnnotationPayload('split', formula.latex, JSON.stringify({
		equivalentTex: 'PR(A)=B+V(A)',
		parts: [
			{ label: 'Base', tex: 'B=x', contribution: 'base probability' },
			{ label: 'Vote', tex: 'V(A)=y', contribution: 'incoming links' },
		],
	}));
	if (payload.detailKind !== 'split') throw new Error('split payload missing');
	const patch = buildFormulaSplitPatch(block.blockId, block.source.from, formula, payload);
	await hub.commit({
		origin: 'ai',
		label: 'PageRank · 拆分公式',
		...patch,
	});
	const committed = vault.read('formula.md');
	check('split commit writes one self-contained aligned formula', committed.includes('\\begin{aligned}'));
	check('split commit includes every shorthand definition', committed.includes('B=x') && committed.includes('V(A)=y'));
	check('split commit is recorded as one AI History transaction', hub.projection().history.length === 1);
	check('split commit enables document Undo', hub.projection().undo.canUndo);
	await hub.undo();
	check('split Undo restores exact original Markdown bytes', vault.read('formula.md') === source);
}

async function main(): Promise<void> {
	await testStructuredStreamingStore();
	await testSplitCommitAndUndo();
	done('composer-formula-typed-runtime');
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
