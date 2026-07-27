import * as React from 'react';
import type { ComposerActionDescriptor, ComposerBlock, ComposerContextSnapshot } from '@/core/composer';
import {
	buildInsertBlockBelowOps,
	buildReplaceBlockSourceOps,
	chartSpecToFencedSource,
	colCount,
	csvToModel,
	describeSelection,
	isCellSelected,
	modelToCsv,
	modelToHtml,
	parseTableSource,
	resolveGrid,
	serializeTable,
	type TableModel,
	type TableSelectionState,
} from '@/service/composer';
import { useComposerChrome } from '../../chrome/ComposerChromeContext';
import { TableToolbar } from './TableToolbar';
import { useTableObjectSelection } from './useTableObjectSelection';

/**
 * Peak Composer — table block (WP6). Renders the parsed table model as an
 * accessible grid with dual-mode selection (native text on glyph, object cell
 * range on padding/edge) and the deterministic object toolbar. All mutations
 * re-serialize the model to the narrowest lossless syntax (pipe → HTML on merge)
 * and commit through the transaction hub. AI actions are projected from the
 * capability port (none render until the runtime is wired — no dead buttons).
 */
export function TableBlockView({ block }: { block: ComposerBlock }): React.ReactElement {
	const parsed = React.useMemo(() => safeParse(block.renderModel.raw), [block.renderModel.raw]);
	if (!parsed) {
		// Unparseable table source: never hide content — fall back to the verbatim slice.
		return (
			<pre className="pk-composer-mono" data-src-text-from={block.source.from} data-block-id={block.blockId}>
				{block.renderModel.raw}
			</pre>
		);
	}
	return <TableBlockBody block={block} model={parsed} />;
}

function safeParse(raw: string): TableModel | null {
	try {
		return parseTableSource(raw);
	} catch {
		return null;
	}
}

function TableBlockBody({ block, model }: { block: ComposerBlock; model: TableModel }): React.ReactElement {
	const chrome = useComposerChrome();
	const hub = chrome.runtime.hub;
	const writable = Boolean(hub);
	const strings = chrome.config.table;
	const tableRef = React.useRef<HTMLTableElement | null>(null);
	const fileRef = React.useRef<HTMLInputElement | null>(null);
	const [reason, setReason] = React.useState<string | null>(null);
	const selection = useTableObjectSelection(model, tableRef);

	const commitModel = async (next: TableModel): Promise<void> => {
		if (!hub || !chrome.snapshot) return;
		const source = serializeTable(next, modelToHtml);
		const built = buildReplaceBlockSourceOps(chrome.snapshot, block.blockId, source);
		if (!built) return;
		selection.clear();
		await tryCommit(() => hub.commit({ origin: 'deterministic', label: chrome.config.chrome.actions.directEdit, operations: built.operations, target: built.target, expectedBlockDelta: built.expectedBlockDelta }));
	};

	const generateChart = async (result: ReturnType<typeof import('@/service/composer').tableToChartSpec>): Promise<void> => {
		if (!result.ok) return setReason(result.reason);
		if (!hub || !chrome.snapshot) return;
		const built = buildInsertBlockBelowOps(chrome.snapshot, block.blockId, chartSpecToFencedSource(result.spec), 'code');
		if (!built) return;
		await tryCommit(() => hub.commit({ origin: 'deterministic', label: chrome.config.chrome.actions.insertBelow, operations: built.operations, target: built.target, expectedBlockDelta: built.expectedBlockDelta }));
	};

	const exportCsv = (): void => {
		const res = modelToCsv(model);
		if (!res.ok) return setReason(res.reason);
		const doc = tableRef.current?.ownerDocument;
		const win = doc?.defaultView;
		if (!doc || !win) return;
		const blob = new win.Blob([res.csv], { type: 'text/csv' });
		const url = win.URL.createObjectURL(blob);
		const a = doc.createElement('a');
		a.href = url;
		a.download = 'table.csv';
		a.click();
		win.URL.revokeObjectURL(url);
	};

	const onFilePicked = async (ev: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
		const file = ev.target.files?.[0];
		ev.target.value = '';
		if (!file) return;
		const text = await file.text();
		await commitModel(csvToModel(text));
	};

	const aiActions = useProjectedActions(block);
	const invokeAi = (d: ComposerActionDescriptor): void => {
		try {
			chrome.projection.invoke(d.capabilityId, makeTableSnapshot(chrome, block));
		} catch {
			/* mis-wired port only — stub projects nothing */
		}
	};

	const describe = describeSelection(selection.state, model, strings.selection);

	return (
		<div className="pk-table-surface" data-has-object-selection={selection.selecting || undefined}>
			<TableToolbar
				model={model}
				selection={selection.state}
				strings={strings.toolbar}
				writable={writable}
				onCommitModel={(next) => void commitModel(next)}
				onGenerateChart={(res) => void generateChart(res)}
				onImportCsv={() => fileRef.current?.click()}
				onExportCsv={exportCsv}
				onReason={setReason}
				aiActions={aiActions}
				onInvokeAi={invokeAi}
			/>
			<TableGrid
				tableRef={tableRef}
				model={model}
				selection={selection.state}
				selecting={selection.selecting}
				ariaLabel={describe}
				onCellPointerDown={selection.onCellPointerDown}
				onKeyDown={selection.onKeyDown}
			/>
			<span className="pk-table-aria" role="status" aria-live="polite">
				{describe}
			</span>
			{reason && <div className="pk-table-reason" role="note">{reason}</div>}
			<input ref={fileRef} type="file" accept=".csv,text/csv" hidden onChange={(ev) => void onFilePicked(ev)} />
		</div>
	);
}

// ── grid ────────────────────────────────────────────────────────────────────

function TableGrid({
	tableRef,
	model,
	selection,
	selecting,
	ariaLabel,
	onCellPointerDown,
	onKeyDown,
}: {
	tableRef: React.RefObject<HTMLTableElement>;
	model: TableModel;
	selection: TableSelectionState;
	selecting: boolean;
	ariaLabel: string;
	onCellPointerDown: (row: number, col: number, ev: React.PointerEvent<HTMLElement>) => 'text' | 'object';
	onKeyDown: (ev: React.KeyboardEvent<HTMLElement>) => void;
}): React.ReactElement {
	const { grid, cols } = resolveGrid(model);
	const headRows = model.rows.map((r, i) => ({ r, isHeader: r.isHeader, index: i })).filter((x) => x.isHeader);
	const bodyRows = model.rows.map((r, i) => ({ r, isHeader: r.isHeader, index: i })).filter((x) => !x.isHeader);

	const renderRow = (rowIndex: number, tag: 'th' | 'td'): React.ReactElement[] => {
		const out: React.ReactElement[] = [];
		for (let c = 0; c < cols; c++) {
			const g = grid[rowIndex][c];
			if (!g || !g.anchor) continue;
			out.push(
				<TableCellView
					key={`${rowIndex}-${c}`}
					tag={tag}
					row={rowIndex}
					col={c}
					model={model}
					selection={selection}
					onCellPointerDown={onCellPointerDown}
				/>,
			);
		}
		return out;
	};

	return (
		<table
			ref={tableRef}
			className={`pk-composer-table${selecting ? ' is-cell-selecting' : ''}`}
			role="grid"
			aria-label={ariaLabel}
			tabIndex={0}
			onKeyDown={onKeyDown}
		>
			<thead>
				{headRows.map(({ index }) => (
					<tr key={index}>{renderRow(index, 'th')}</tr>
				))}
			</thead>
			<tbody>
				{bodyRows.map(({ index }) => (
					<tr key={index}>{renderRow(index, 'td')}</tr>
				))}
			</tbody>
		</table>
	);
}

function TableCellView({
	tag,
	row,
	col,
	model,
	selection,
	onCellPointerDown,
}: {
	tag: 'th' | 'td';
	row: number;
	col: number;
	model: TableModel;
	selection: TableSelectionState;
	onCellPointerDown: (row: number, col: number, ev: React.PointerEvent<HTMLElement>) => 'text' | 'object';
}): React.ReactElement {
	const g = resolveGrid(model).grid[row][col]!;
	const cell = g.cell;
	const align = cell.align ?? model.columns[col]?.align ?? 'none';
	const selected = isCellSelected(selection, model, row, col);
	const edge = selected ? edgeClasses(model, selection, row, col, cell.colspan, cell.rowspan) : '';
	const className = [selected ? 'is-range-cell' : '', edge].filter(Boolean).join(' ') || undefined;
	const Tag = tag;
	return (
		<Tag
			className={className}
			data-cell-row={row}
			data-cell-col={col}
			data-align={align !== 'none' ? align : undefined}
			{...(cell.colspan > 1 ? { colSpan: cell.colspan } : {})}
			{...(cell.rowspan > 1 ? { rowSpan: cell.rowspan } : {})}
			onPointerDown={(ev) => onCellPointerDown(row, col, ev)}
		>
			<span className="pk-tcell-text">{cell.text}</span>
		</Tag>
	);
}

/** Perimeter edge classes so the selection outline hugs its outer boundary. */
function edgeClasses(model: TableModel, selection: TableSelectionState, r: number, c: number, colspan: number, rowspan: number): string {
	const out: string[] = [];
	if (!isCellSelected(selection, model, r - 1, c)) out.push('is-range-top');
	if (!isCellSelected(selection, model, r + rowspan, c)) out.push('is-range-bottom');
	if (!isCellSelected(selection, model, r, c - 1)) out.push('is-range-left');
	if (!isCellSelected(selection, model, r, c + colspan)) out.push('is-range-right');
	return out.join(' ');
}

// ── AI projection ────────────────────────────────────────────────────────────

function useProjectedActions(block: ComposerBlock): readonly ComposerActionDescriptor[] {
	const chrome = useComposerChrome();
	return React.useMemo(() => {
		try {
			return chrome.projection.actionsFor(makeTableSnapshot(chrome, block), 'object-toolbar');
		} catch {
			return [];
		}
	}, [chrome, block]);
}

function makeTableSnapshot(chrome: ReturnType<typeof useComposerChrome>, block: ComposerBlock): ComposerContextSnapshot {
	const snap = chrome.snapshot;
	const from = block.source.from;
	const to = block.source.to;
	const src = snap?.sourceText.slice(from, to) ?? block.renderModel.raw;
	return {
		documentId: snap?.documentId ?? '',
		revision: snap?.revision ?? block.source.revision,
		target: { kind: 'block', blockId: block.blockId },
		targetSource: src,
	};
}

async function tryCommit(fn: () => Promise<unknown>): Promise<void> {
	try {
		await fn();
	} catch {
		/* conflict — surfaced via lifecycle staleness */
	}
}
