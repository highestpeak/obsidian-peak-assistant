import * as React from 'react';
import {
	AlignCenter,
	AlignLeft,
	AlignRight,
	ArrowUpDown,
	ChartColumn,
	Columns3,
	Copy,
	FileDown,
	FileUp,
	Merge,
	Minus,
	Plus,
	Repeat2,
	Rows3,
	Sigma,
	Split,
	TableProperties,
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
	type TableModel,
	type TableOpResult,
	type TableSelectionState,
} from '@/service/composer';
import { Button } from '@/ui/components/primitives';
import type { TableToolbarStrings } from './tableViewConfig';
import { useRovingComposite } from '@/ui/keyboard/useRovingComposite';
import { PEAK_KEYBOARD_ZONE_LABELS } from '@/ui/keyboard/config/KeyboardNavigationDefaults';

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
}

type MenuKind = 'formula' | 'csv' | null;
type StructureAction = {
	axis: 'row' | 'column';
	operation: 'add' | 'remove';
};

export function TableToolbar(props: TableToolbarProps): React.ReactElement {
	const { model, selection, strings, writable } = props;
	const toolbarLabelId = React.useId();
	const toolbarRef = React.useRef<HTMLDivElement | null>(null);
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
	const activeAlign = model.columns[activeCol]?.align ?? 'none';

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
		if (merges) return props.onReason(strings.formula + ': ' + strings.mergedCells);
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
	const closeMenu = (): void => {
		const trigger = toolbarRef.current?.querySelector<HTMLElement>('[aria-expanded="true"]');
		setMenu(null);
		trigger?.ownerDocument.defaultView?.requestAnimationFrame(() => {
			if (trigger?.isConnected) trigger.focus({ preventScroll: true });
		});
	};
	useRovingComposite(toolbarRef, {
		itemSelector: '.pk-table-tool__button:not([disabled])',
		orientation: 'horizontal',
		rememberBy: 'aria-label',
	});

	return (
		<div
			ref={toolbarRef}
			className="pk-table-toolbar"
			role="toolbar"
			aria-labelledby={toolbarLabelId}
			data-chrome="true"
			data-composer-contextual-toolbar="table"
			data-peak-keyboard-zone="cv-contextual"
			data-peak-keyboard-zone-label={PEAK_KEYBOARD_ZONE_LABELS['cv-contextual']}
			onKeyDown={(event) => {
				if (event.defaultPrevented || event.key !== 'Escape' || !menu) return;
				event.preventDefault();
				event.stopPropagation();
				closeMenu();
			}}
		>
			<span id={toolbarLabelId} className="pk-table-toolbar__a11y-label">{strings.format}</span>
			<ToolbarButton icon={AlignLeft} label={strings.alignLeft} hint={strings.alignLeftHint} delayMs={strings.tooltipDelayMs} disabled={disabled} onClick={() => commit(setColumnAlign(model, activeCol, 'left'))} active={activeAlign === 'left'} />
			<ToolbarButton icon={AlignCenter} label={strings.alignCenter} hint={strings.alignCenterHint} delayMs={strings.tooltipDelayMs} disabled={disabled} onClick={() => commit(setColumnAlign(model, activeCol, 'center'))} active={activeAlign === 'center'} />
			<ToolbarButton icon={AlignRight} label={strings.alignRight} hint={strings.alignRightHint} delayMs={strings.tooltipDelayMs} disabled={disabled} onClick={() => commit(setColumnAlign(model, activeCol, 'right'))} active={activeAlign === 'right'} />
			<Divider />
			<ToolbarButton icon={Rows3} structureAction={{ axis: 'row', operation: 'add' }} label={strings.addRow} hint={strings.addRowHint} delayMs={strings.tooltipDelayMs} disabled={disabled} onClick={() => commit(addRow(model, activeRow + 1))} />
			<ToolbarButton icon={Rows3} structureAction={{ axis: 'row', operation: 'remove' }} label={strings.removeRow} hint={strings.removeRowHint} delayMs={strings.tooltipDelayMs} disabled={disabled} onClick={() => commit(removeRow(model, activeRow))} />
			<ToolbarButton icon={Columns3} structureAction={{ axis: 'column', operation: 'add' }} label={strings.addColumn} hint={strings.addColumnHint} delayMs={strings.tooltipDelayMs} disabled={disabled} onClick={() => commit(addColumn(model, activeCol + 1))} />
			<ToolbarButton icon={Columns3} structureAction={{ axis: 'column', operation: 'remove' }} label={strings.removeColumn} hint={strings.removeColumnHint} delayMs={strings.tooltipDelayMs} disabled={disabled} onClick={() => commit(removeColumn(model, activeCol))} />
			<Divider />
			<ToolbarButton
				icon={ArrowUpDown}
				label={strings.sort}
				hint={strings.sortHint}
				delayMs={strings.tooltipDelayMs}
				disabled={disabled || merges}
				reason={merges ? strings.sort : undefined}
				onClick={() => {
					const dir = sortDir === 'asc' ? 'desc' : 'asc';
					setSortDir(dir);
					commit(sortByColumn(model, activeCol, dir));
				}}
			/>
			<ToolbarButton icon={Sigma} label={strings.formula} hint={strings.formulaHint} delayMs={strings.tooltipDelayMs} disabled={disabled || merges} onClick={() => setMenu(menu === 'formula' ? null : 'formula')} active={menu === 'formula'} menuOpen={menu === 'formula'} />
			{menu === 'formula' && (
				<Menu>
					<MenuItem icon={Sigma} label={strings.sumColumn} onClick={appendTotalsRow} />
				</Menu>
			)}
			<Divider />
			{singleMergedAnchor ? (
				<ToolbarButton icon={Split} label={strings.unmerge} hint={strings.unmergeHint} delayMs={strings.tooltipDelayMs} disabled={disabled} onClick={() => rect && commit(unmergeAt(model, rect.r0, rect.c0))} />
			) : (
				<ToolbarButton icon={Merge} label={strings.merge} hint={strings.mergeHint} delayMs={strings.tooltipDelayMs} disabled={disabled || !rect} reason={!rect ? strings.needRectangle : undefined} onClick={doMerge} />
			)}
			<ToolbarButton icon={Repeat2} label={strings.transpose} hint={strings.transposeHint} delayMs={strings.tooltipDelayMs} disabled={disabled || merges} onClick={() => commit(transpose(model))} />
			<Divider />
			<ToolbarButton icon={TableProperties} label={strings.csv} hint={strings.csvHint} delayMs={strings.tooltipDelayMs} disabled={disabled} onClick={() => setMenu(menu === 'csv' ? null : 'csv')} active={menu === 'csv'} menuOpen={menu === 'csv'} />
			{menu === 'csv' && (
				<Menu>
					<MenuItem icon={Copy} label={strings.csvCopy} onClick={() => void copyCsv()} />
					<MenuItem icon={FileDown} label={strings.csvExport} onClick={() => { props.onExportCsv(); setMenu(null); }} />
					<MenuItem icon={FileUp} label={strings.csvImport} onClick={() => { props.onImportCsv(); setMenu(null); }} />
				</Menu>
			)}
			<ToolbarButton icon={ChartColumn} label={strings.chart} hint={strings.chartHint} delayMs={strings.tooltipDelayMs} disabled={disabled} onClick={generateChart} />
		</div>
	);
}

// ── presentational bits ─────────────────────────────────────────────────────

function ToolbarButton({
	icon: Icon,
	label,
	hint,
	delayMs,
	onClick,
	disabled,
	reason,
	active,
	menuOpen,
	structureAction,
}: {
	icon: LucideIcon;
	label: string;
	hint: string;
	delayMs: number;
	onClick: () => void;
	disabled?: boolean;
	reason?: string;
	active?: boolean;
	menuOpen?: boolean;
	structureAction?: StructureAction;
}): React.ReactElement {
	const tooltipId = React.useId();
	const tooltipText = disabled && reason ? reason : hint;
	const OperationIcon = structureAction?.operation === 'remove' ? Minus : Plus;
	return (
		<span
			className="pk-table-tool"
			style={{ '--pk-table-tooltip-delay': `${delayMs}ms` } as React.CSSProperties}
		>
			<Button
				type="button"
				variant="ghost"
				size="sm"
				className={active ? 'pk-table-tool__button is-active' : 'pk-table-tool__button'}
				disabled={disabled}
				aria-label={label}
				aria-describedby={tooltipId}
				aria-pressed={active === undefined ? undefined : active}
				aria-haspopup={menuOpen === undefined ? undefined : 'menu'}
				aria-expanded={menuOpen}
				onClick={onClick}
			>
				<span
					className="pk-table-tool__icon"
					data-axis={structureAction?.axis}
					data-operation={structureAction?.operation}
					aria-hidden="true"
				>
					<Icon size={16} />
					{structureAction && <OperationIcon className="pk-table-tool__icon-badge" size={9} />}
				</span>
				<span className="pk-table-tool__label" aria-hidden="true">{label}</span>
			</Button>
			<span id={tooltipId} className="pk-table-tool__tooltip" role="tooltip">
				<strong>{label}</strong>
				<span>{tooltipText}</span>
			</span>
		</span>
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
		<Button type="button" variant="ghost" size="sm" role="menuitem" onClick={onClick}>
			<Icon size={12} />
			<span>{label}</span>
		</Button>
	);
}

function Divider(): React.ReactElement {
	return <span className="pk-table-toolbar__divider" aria-hidden="true" />;
}
