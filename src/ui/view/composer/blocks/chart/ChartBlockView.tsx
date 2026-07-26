import * as React from 'react';
import type { ComposerBlock } from '@/core/composer';
import {
	buildReplaceBlockSourceOps,
	chartSpecToFencedSource,
	isChartSource,
	parseChartSource,
	switchChartType,
	type ChartSpec,
	type ChartType,
} from '@/service/composer';
import { useComposerChrome } from '../../chrome/ComposerChromeContext';
import { DEFAULT_TABLE_BLOCK_STRINGS } from '../table/tableViewConfig';

const LazyRecharts = React.lazy(() => import('./RechartsChart'));

/** True when a `code` block is actually a fenced ```chart block (BlockKindView dispatch). */
export function isChartBlock(block: ComposerBlock): boolean {
	if (block.kind !== 'code') return false;
	if (block.renderModel.language === 'chart') return true;
	return isChartSource(block.renderModel.raw);
}

/**
 * Peak Composer — chart block (WP6, §10.6). Renders a fenced ```chart spec with
 * lazily-loaded recharts; the bar/line/pie switch writes the new type back to the
 * fenced source through the hub (source is the single truth — no duplicate render
 * of the chart and its source). Invalid specs never hide content: the verbatim
 * fenced source is shown with a reason.
 */
export function ChartBlockView({ block }: { block: ComposerBlock }): React.ReactElement {
	const chrome = useComposerChrome();
	const hub = chrome.runtime.hub;
	const strings = DEFAULT_TABLE_BLOCK_STRINGS.chart;
	const parsed = React.useMemo(() => parseChartSource(block.renderModel.raw), [block.renderModel.raw]);

	if (!parsed.ok) {
		return (
			<div className="pk-chart-surface">
				<div className="pk-chart-error" role="note">{strings.invalid}: {parsed.reason}</div>
				<pre className="pk-composer-mono" data-src-text-from={block.source.from} data-block-id={block.blockId}>
					{block.renderModel.raw}
				</pre>
			</div>
		);
	}
	const spec = parsed.spec;

	const switchType = async (type: ChartType): Promise<void> => {
		if (!hub || !chrome.snapshot || type === spec.type) return;
		const next = switchChartType(spec, type);
		const built = buildReplaceBlockSourceOps(chrome.snapshot, block.blockId, chartSpecToFencedSource(next));
		if (!built) return;
		try {
			await hub.commit({ origin: 'deterministic', label: chrome.config.chrome.actions.directEdit, operations: built.operations, target: built.target, expectedBlockDelta: built.expectedBlockDelta });
		} catch {
			/* conflict — surfaced via lifecycle staleness */
		}
	};

	return (
		<div className="pk-chart-surface">
			<div className="pk-chart-head">
				<span className="pk-chart-title">{spec.title ?? strings.untitled}</span>
				<TypeSwitch current={spec.type} disabled={!hub} strings={strings} onSwitch={(t) => void switchType(t)} />
			</div>
			<div className="pk-chart-canvas">
				<React.Suspense fallback={<ChartFallback label={strings.loading} />}>
					<ChartErrorBoundary spec={spec} invalidLabel={strings.invalid}>
						<LazyRecharts spec={spec} />
					</ChartErrorBoundary>
				</React.Suspense>
			</div>
		</div>
	);
}

function TypeSwitch({
	current,
	disabled,
	strings,
	onSwitch,
}: {
	current: ChartType;
	disabled: boolean;
	strings: { bar: string; line: string; pie: string };
	onSwitch: (t: ChartType) => void;
}): React.ReactElement {
	const options: { type: ChartType; label: string }[] = [
		{ type: 'bar', label: strings.bar },
		{ type: 'line', label: strings.line },
		{ type: 'pie', label: strings.pie },
	];
	return (
		<div className="pk-chart-typeswitch" role="group" aria-label="Chart type">
			{options.map((o) => (
				<button
					key={o.type}
					type="button"
					className={o.type === current ? 'is-active' : undefined}
					aria-pressed={o.type === current}
					disabled={disabled}
					onClick={() => onSwitch(o.type)}
				>
					{o.label}
				</button>
			))}
		</div>
	);
}

function ChartFallback({ label }: { label: string }): React.ReactElement {
	return <div className="pk-chart-fallback">{label}</div>;
}

class ChartErrorBoundary extends React.Component<
	{ spec: ChartSpec; invalidLabel: string; children: React.ReactNode },
	{ failed: boolean }
> {
	state = { failed: false };
	static getDerivedStateFromError(): { failed: boolean } {
		return { failed: true };
	}
	render(): React.ReactNode {
		if (this.state.failed) return <div className="pk-chart-fallback">{this.props.invalidLabel}</div>;
		return this.props.children;
	}
}
