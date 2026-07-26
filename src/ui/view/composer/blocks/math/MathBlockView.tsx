import * as React from 'react';
import { useStore } from 'zustand';
import { Copy, Sparkles } from 'lucide-react';
import type { ComposerBlock } from '@/core/composer';
import { parseFormulaBlock, buildFormulaCopyPayloads, type ParsedFormula } from '@/service/composer';
import type { ComposerFormulaDetailKind } from '@/core/schemas/composer';
import { Button } from '@/ui/components/primitives';
import { rasterizeElementToPngBlob } from '../../chrome/rasterize';
import { useComposerChrome } from '../../chrome/ComposerChromeContext';
import { KatexFormula } from './KatexFormula';
import { FormulaDetailPanel } from './FormulaDetailPanel';
import { createFormulaDetailStore, type FormulaDetailStore } from './formulaDetailStore';
import { DEFAULT_MATH_CONFIG, type MathConfig } from './mathConfig';

/**
 * Peak Composer — math block view (WP5, §10.2).
 *
 * Replaces the verbatim `$$…$$` mono box with a KaTeX display micro-block per
 * formula. Each formula carries its own flattened action row (在下方插入 / 复制 |
 * 解释公式 / 拆分公式 / 变量表) and its three INDEPENDENT detail panels — any
 * combination open, no global accordion (§3.3). Copy exposes the four formats
 * (plain / LaTeX / HTML+MathML / exact rendered image). When no AI generator is
 * wired the detail actions render disabled with a reason (never fake buttons).
 */
export function MathBlockView({
	block,
	store: storeProp,
	config = DEFAULT_MATH_CONFIG,
}: {
	block: ComposerBlock;
	store?: FormulaDetailStore;
	config?: MathConfig;
}): React.ReactElement {
	// The math details drive a bespoke per-block store (§3.3). When the editing
	// runtime wires a formula-detail generator, the store streams real AI; without
	// one (read-only host / harness) `canGenerate` stays false and the detail
	// actions render disabled with a reason — never a fake button.
	const chrome = useComposerChrome();
	const [fallbackStore] = React.useState(() => createFormulaDetailStore(chrome.runtime.formulaDetailGenerator));
	const store = storeProp ?? fallbackStore;
	const formulas = React.useMemo(() => parseFormulaBlock(block.renderModel.raw), [block.renderModel.raw]);

	if (formulas.length === 0) {
		return (
			<pre className="pk-composer-mono" data-src-text-from={block.source.from} data-block-id={block.blockId}>
				{block.renderModel.raw}
			</pre>
		);
	}

	return (
		<div className="pk-math-stack" data-block-id={block.blockId} data-src-text-from={block.source.from}>
			{formulas.map((formula) => (
				<FormulaCard key={formula.id} formula={formula} store={store} config={config} />
			))}
		</div>
	);
}

const DETAIL_KINDS: readonly ComposerFormulaDetailKind[] = ['explain', 'split', 'variables'];

function FormulaCard({
	formula,
	store,
	config,
}: {
	formula: ParsedFormula;
	store: FormulaDetailStore;
	config: MathConfig;
}): React.ReactElement {
	const cardRef = React.useRef<HTMLDivElement | null>(null);
	const renderRef = React.useRef<HTMLDivElement | null>(null);
	const [copyOpen, setCopyOpen] = React.useState(false);
	const canGenerate = useStore(store, (s) => s.canGenerate);
	const openKinds = useStore(store, (s) =>
		DETAIL_KINDS.filter((k) => s.model.entries[`${formula.id}::${k}`]?.open),
	);

	return (
		<div className="pk-math-card" ref={cardRef} data-formula-id={formula.id}>
			<span className="pk-math-card__label">{formula.label}</span>
			<div className="pk-math-card__render" ref={renderRef}>
				<KatexFormula latex={formula.latex} display />
			</div>
			<div className="pk-math-card__row" data-chrome="true">
				<span className="pk-math-card__group">
					<CopyControl formula={formula} renderRef={renderRef} config={config} open={copyOpen} setOpen={setCopyOpen} />
				</span>
				<span className="pk-math-card__group">
					{DETAIL_KINDS.map((kind) => (
						<Button
							key={kind}
							variant="ghost"
							size="sm"
							className="pk-math-card__ai"
							data-active={openKinds.includes(kind) || undefined}
							disabled={!canGenerate}
							title={canGenerate ? undefined : config.detail.streaming}
							onClick={() => store.getState().toggle(formula.id, kind, formula.latex, formula.label)}
						>
							<Sparkles size={12} />
							{config.detail[kind]}
						</Button>
					))}
				</span>
			</div>
			{DETAIL_KINDS.map((kind) => (
				<FormulaDetailPanel
					key={kind}
					store={store}
					formulaId={formula.id}
					kind={kind}
					latex={formula.latex}
					label={formula.label}
					config={config}
				/>
			))}
		</div>
	);
}

function CopyControl({
	formula,
	renderRef,
	config,
	open,
	setOpen,
}: {
	formula: ParsedFormula;
	renderRef: React.RefObject<HTMLDivElement | null>;
	config: MathConfig;
	open: boolean;
	setOpen: (v: boolean) => void;
}): React.ReactElement {
	const [copied, setCopied] = React.useState<string | null>(null);

	const win = () => renderRef.current?.ownerDocument.defaultView ?? window;
	const flash = (label: string) => {
		setCopied(label);
		setOpen(false);
		setTimeout(() => setCopied(null), 1400);
	};

	const copyText = async (kind: 'plain' | 'latex' | 'html', label: string) => {
		const payloads = buildFormulaCopyPayloads(formula.latex);
		await win().navigator.clipboard.writeText(payloads[kind]);
		flash(label);
	};
	const copyImage = async () => {
		const el = renderRef.current;
		if (!el) return;
		const blob = await rasterizeElementToPngBlob(el);
		if (!blob) return;
		const w = win() as Window & { ClipboardItem?: typeof ClipboardItem };
		if (w.ClipboardItem && w.navigator.clipboard?.write) {
			await w.navigator.clipboard.write([new w.ClipboardItem({ 'image/png': blob })]);
		}
		flash(config.copy.image);
	};

	return (
		<span className="pk-math-copy">
			<Button variant="ghost" size="sm" onClick={() => setOpen(!open)}>
				<Copy size={12} />
				{copied ?? config.copy.copyFormula}
			</Button>
			{open && (
				<span className="pk-math-copy__menu" role="menu">
					<button type="button" role="menuitem" onClick={() => void copyText('plain', config.copy.plain)}>{config.copy.plain}</button>
					<button type="button" role="menuitem" onClick={() => void copyText('latex', config.copy.latex)}>{config.copy.latex}</button>
					<button type="button" role="menuitem" onClick={() => void copyText('html', config.copy.html)}>{config.copy.html}</button>
					<button type="button" role="menuitem" onClick={() => void copyImage()}>{config.copy.image}</button>
				</span>
			)}
		</span>
	);
}
