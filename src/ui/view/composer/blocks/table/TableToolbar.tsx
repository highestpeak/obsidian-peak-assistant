import * as React from 'react';
import {
	AlignCenter,
	AlignLeft,
	AlignRight,
	ArrowUpDown,
	BarChart3,
	FileSpreadsheet,
	FlipVertical2,
	Merge,
	Minus,
	Plus,
	Sigma,
	Sparkles,
	Split,
	type LucideIcon,
} from 'lucide-react';
import {
	addColumn,
	addRow,
	colCount,
	hasMerges,
	mergeRange,
	modelToCsv,
	removeColumn,
	removeRow,
	resolveGrid,
	selectionRectangle,
	setColumnAlign,
	sortByColumn,
	tableToChartSpec,
	transpose,
	unmergeAt,
	type TableAlign,
	type TableModel,
	type TableOpResult,
	type TableSelectionState,
} from '@/service/composer';
import type { ComposerActionDescriptor } from '@/core/composer';
import type { TableToolbarStrings } from './tableViewConfig';

export interface TableToolbarProps {
	model: TableModel;
	selection: TableSelectionState;
	strings: TableToolbarStrings;
	writable: boolean;
	/** Commit a mutated model (serialize + replaceRange + hub.commit). */
	onCommitModel: (next: TableModel) => void;
	/** Insert a generated chart block below the table. */
	onGenerateChart: (result: ReturnType<typeof tableToChartSpec>) => void;
	/** Replace the table from imported CSV. */
	onImportCsv: () => void;
	/** Download the table as a CSV file (owner-document scoped). */
	onExportCsv: () => void;
	/** Surface a "why disabled" reason. */
	onReason: (reason: string) => void;
	/** Projected AI actions (empty until the runtime is wired). */
	aiActions: readonly ComposerActionDescriptor[];
	onInvokeAi: (descriptor: ComposerActionDescriptor) => void;
}

type MenuKind = 'align' | 'formula' | 'csv' | null;

export function TableToolbar(props: TableToolbarProps): React.ReactElement {
	const { model, selection, strings, writable } = props;
	const [menu, setMenu] = React.useState<MenuKind>(null);
	const [sortDir, setSortDir] = React.useState<'asc' | 'desc'>('asc');
	const merges = hasMerges(model);
	const active = selection.active?.focus ?? null;
	const rect = selectionRectangle(selection, model);

	const commit = (res: TableOpResult): void => {
		if (res.ok) props.onCommitModel(res.model);
		else props.onReason(res.reason);
		setMenu(null);
	};

	const activeRow = active?.row ?? model.rows.length - 1;
	const activeCol = active?.col ?? colCount(model) - 1;

	const doMerge = (): void => {
		if (!rect || rect.r0 === rect.r1 && rect.c0 === rect.c1) return props.onReason(strings.needRectangle);
		commit(mergeRange(model, rect));
	};
	const singleMergedAnchor = ((): boolean => {
		if (!rect || rect.r0 !== rect.r1 || rect.c0 !== rect.c1) return false;
		const g = resolveGrid(model).grid[rect.r0]?.[rect.c0];
		return Boolean(g?.anchor && (g.cell.colspan > 1 || g.cell.rowspan > 1));
	})();

	const generateChart = (): void => props.onGenerateChart(tableToChartSpec(model, 'bar'));

	const appendTotalsRow = (): void => {
		const cols = colCount(model);
		const { grid } = resolveGrid(model);
		const cells = Array.from({ length: cols }, (_, c) => {
			if (c === 0) return { text: strings.summary, colspan: 1, rowspan: 1 };
			let sum = 0;
			let numeric = false;
			for (let r = 1; r < model.rows.length; r++) {
				const t = grid[r]?.[c]?.cell.text?.trim() ?? '';
				if (t === '' || Number.isNaN(Number(t))) continue;
				sum += Number(t);
				numeric = true;
			}
			return { text: numeric ? String(sum) : '', colspan: 1, rowspan: 1 };
		});
		if (merges) return props.onReason(strings.formula + ': ' + 'merged cells');
		const next: TableModel = { columns: model.columns, rows: [...model.rows, { isHeader: false, cells }] };
		props.onCommitModel(next);
		setMenu(null);
	};

	const copyCsv = async (): Promise<void> => {
		const res = modelToCsv(model);
		if (!res.ok) return props.onReason(res.reason);
		try {
			await navigator.clipboard.writeText(res.csv);
		} catch {
			/* clipboard denied — no-op */
		}
		setMenu(null);
	};

	const disabled = !writable;

	return (
		<div className="pk-table-toolbar" role="toolbar" aria-label={strings.format} data-chrome="true">
			<ToolbarButton icon={AlignLeft} label={strings.align} disabled={disabled} onClick={() => setMenu(menu === 'align' ? null : 'align')} active={menu === 'align'} />
			{menu === 'align' && (
				<Menu>
					<MenuItem icon={AlignLeft} label={strings.alignLeft} onClick={() => commit(setColumnAlign(model, activeCol, 'left'))} />
					<MenuItem icon={AlignCenter} label={strings.alignCenter} onClick={() => commit(setColumnAlign(model, activeCol, 'center'))} />
					<MenuItem icon={AlignRight} label={strings.alignRight} onClick={() => commit(setColumnAlign(model, activeCol, 'right'))} />
				</Menu>
			)}
			<Divider />
			<ToolbarButton icon={Plus} label={strings.addRow} disabled={disabled} onClick={() => commit(addRow(model, activeRow + 1))} />
			<ToolbarButton icon={Minus} label={strings.removeRow} disabled={disabled} onClick={() => commit(removeRow(model, activeRow))} />
			<ToolbarButton icon={Plus} label={strings.addColumn} disabled={disabled} onClick={() => commit(addColumn(model, activeCol + 1))} />
			<ToolbarButton icon={Minus} label={strings.removeColumn} disabled={disabled} onClick={() => commit(removeColumn(model, activeCol))} />
			<Divider />
			<ToolbarButton
				icon={ArrowUpDown}
				label={strings.sort}
				disabled={disabled || merges}
				reason={merges ? strings.sort : undefined}
				onClick={() => {
					const dir = sortDir === 'asc' ? 'desc' : 'asc';
					setSortDir(dir);
					commit(sortByColumn(model, activeCol, dir));
				}}
			/>
			<ToolbarButton icon={Sigma} label={strings.formula} disabled={disabled || merges} onClick={() => setMenu(menu === 'formula' ? null : 'formula')} active={menu === 'formula'} />
			{menu === 'formula' && (
				<Menu>
					<MenuItem icon={Sigma} label={strings.sumColumn} onClick={appendTotalsRow} />
				</Menu>
			)}
			<Divider />
			{singleMergedAnchor ? (
				<ToolbarButton icon={Split} label={strings.unmerge} disabled={disabled} onClick={() => rect && commit(unmergeAt(model, rect.r0, rect.c0))} />
			) : (
				<ToolbarButton icon={Merge} label={strings.merge} disabled={disabled || !rect || (rect.r0 === rect.r1 && rect.c0 === rect.c1)} reason={!rect ? strings.needRectangle : undefined} onClick={doMerge} />
			)}
			<ToolbarButton icon={FlipVertical2} label={strings.transpose} disabled={disabled || merges} onClick={() => commit(transpose(model))} />
			<Divider />
			<ToolbarButton icon={FileSpreadsheet} label={strings.csv} disabled={disabled} onClick={() => setMenu(menu === 'csv' ? null : 'csv')} active={menu === 'csv'} />
			{menu === 'csv' && (
				<Menu>
					<MenuItem icon={FileSpreadsheet} label={strings.csvCopy} onClick={() => void copyCsv()} />
					<MenuItem icon={FileSpreadsheet} label={strings.csvExport} onClick={() => { props.onExportCsv(); setMenu(null); }} />
					<MenuItem icon={FileSpreadsheet} label={strings.csvImport} onClick={() => { props.onImportCsv(); setMenu(null); }} />
				</Menu>
			)}
			<ToolbarButton icon={BarChart3} label={strings.chart} disabled={disabled} onClick={generateChart} />
			{props.aiActions.map((a) => (
				<ToolbarButton
					key={a.capabilityId}
					icon={Sparkles}
					label={a.title}
					disabled={disabled || Boolean(a.disabledReason)}
					reason={a.disabledReason}
					onClick={() => props.onInvokeAi(a)}
				/>
			))}
		</div>
	);
}

// ── presentational bits ─────────────────────────────────────────────────────

function ToolbarButton({
	icon: Icon,
	label,
	onClick,
	disabled,
	reason,
	active,
}: {
	icon: LucideIcon;
	label: string;
	onClick: () => void;
	disabled?: boolean;
	reason?: string;
	active?: boolean;
}): React.ReactElement {
	return (
		<button type="button" className={active ? 'is-active' : undefined} disabled={disabled} title={disabled && reason ? reason : label} aria-label={label} onClick={onClick}>
			<Icon size={13} />
			<span>{label}</span>
		</button>
	);
}

function Menu({ children }: { children: React.ReactNode }): React.ReactElement {
	return (
		<div className="pk-table-menu" role="menu">
			{children}
		</div>
	);
}

function MenuItem({ icon: Icon, label, onClick }: { icon: LucideIcon; label: string; onClick: () => void }): React.ReactElement {
	return (
		<button type="button" role="menuitem" onClick={onClick}>
			<Icon size={12} />
			<span>{label}</span>
		</button>
	);
}

function Divider(): React.ReactElement {
	return <span className="pk-table-toolbar__divider" aria-hidden="true" />;
}
