/**
 * Graph tools panel: Path (Discover path input + result) and optional Hops.
 * Display (Tags, Semantic edges) and Analysis (Hubs, MST, Hulls) are in Settings and toolbar.
 */
import React, { useState, useCallback, useId } from 'react';
import { createPortal } from 'react-dom';
import { Route, Focus } from 'lucide-react';
import { Button } from '@/ui/component/shared-ui/button';
import { cn } from '@/ui/react/lib/utils';
import type { GraphConfig } from '../config';
import type { ToolbarFindPathConfig, FindPathResult, ToolbarHopsConfig, ToolbarHopsValue } from '../types';

const sectionTitleClass =
	'pktw-text-[10px] pktw-font-semibold pktw-uppercase pktw-tracking-wide pktw-text-[#9ca3af] pktw-mb-2';
const sectionClass = 'pktw-pt-3 pktw-first:pt-0 pktw-border-t pktw-border-[#e5e7eb] pktw-first:border-t-0 pktw-first:pt-0';
const rowClass = 'pktw-flex pktw-flex-wrap pktw-items-center pktw-gap-x-4 pktw-gap-y-2';

function Section({
	title,
	children,
	className,
}: {
	title?: string;
	children: React.ReactNode;
	className?: string;
}) {
	return (
		<section className={cn(sectionClass, className)}>
			{title ? <h3 className={sectionTitleClass}>{title}</h3> : null}
			{children}
		</section>
	);
}

export interface GraphToolsPanelProps {
	config: GraphConfig;
	onConfigChange: (config: GraphConfig) => void;
	position: { bottom: number; left: number } | null;
	show: boolean;
	embedBelowGraph?: boolean;
	embedInGraph?: boolean;
	onClearPath?: () => void;
	hasPathSelection?: boolean;
	/** Path select mode: when on, clicking two nodes sets start/end and highlights path. */
	pathSelectMode?: boolean;
	onTogglePathSelectMode?: () => void;
	findPath?: ToolbarFindPathConfig | null;
	/** When provided, Hops 1/2/3 are shown inside the Path section (no separate row below). */
	hops?: ToolbarHopsConfig | null;
}

export const GraphToolsPanel: React.FC<GraphToolsPanelProps> = ({
	config,
	onConfigChange,
	position,
	show,
	embedBelowGraph = false,
	embedInGraph = false,
	onClearPath,
	hasPathSelection = false,
	pathSelectMode = false,
	onTogglePathSelectMode,
	findPath,
	hops,
}) => {
	const [pathTarget, setPathTarget] = useState<string | null>(null);
	const [pathLoading, setPathLoading] = useState(false);
	const [pathError, setPathError] = useState<string | null>(null);
	const [pathResult, setPathResult] = useState<FindPathResult>(null);
	const datalistId = useId();

	const runFindPath = useCallback(async () => {
		if (!findPath) return;
		const start = findPath.pathStart?.trim();
		const target = pathTarget?.trim();
		if (!start || !target) {
			setPathError('Select start and end notes');
			return;
		}
		setPathLoading(true);
		setPathError(null);
		setPathResult(null);
		try {
			const out = await findPath.runFindPath(start, target);
			if (out.error) {
				setPathError(out.error);
			} else {
				const result: FindPathResult = { paths: out.paths, markdown: out.markdown };
				setPathResult(result);
				findPath.onPathResult?.(result);
			}
		} catch (e) {
			setPathError(e instanceof Error ? e.message : 'Find path failed');
		} finally {
			setPathLoading(false);
		}
	}, [findPath, pathTarget]);

	if (!show) return null;

	const pathSection = (
		<Section title="Path">
			<div className="pktw-space-y-3">
				<div className={rowClass}>
					<div className="pktw-text-[11px] pktw-text-[#6b7280]">
						{findPath ? 'Enter target below to find path from start (or use Select path in toolbar).' : 'Use Select path in toolbar to pick two nodes.'}
					</div>
				</div>

				{/* Discover path (input + Run) + Hops */}
				{findPath ? (
					<div className="pktw-border-t pktw-border-[#f3f4f6]">
						<div className="pktw-flex pktw-flex-wrap pktw-items-center pktw-gap-2 pktw-mb-2" title="Enter a target note to find and display the path from start.">
							<span className="pktw-text-[11px] pktw-text-[#6b7280] pktw-flex pktw-items-center pktw-gap-1">
								<Route className="pktw-w-3.5 pktw-h-3.5" />
								Discover path
							</span>
							<input
								type="text"
								className="pktw-h-7 pktw-w-[160px] pktw-text-xs pktw-rounded-lg pktw-border pktw-border-[#e5e7eb] pktw-bg-white pktw-px-2 focus:pktw-outline-none focus:pktw-ring-1 focus:pktw-ring-[#e5e7eb]"
								value={pathTarget ?? ''}
								onChange={(e) => setPathTarget(e.target.value.trim() || null)}
								placeholder="Target note"
								list={datalistId}
							/>
							<datalist id={datalistId}>
								{(findPath.candidatePaths ?? []).slice(0, 20).map((item) => (
									<option key={item.path} value={item.path}>
										{item.label || item.path}
									</option>
								))}
							</datalist>
							<Button
								size="sm"
								variant="secondary"
								className="pktw-h-7 pktw-px-2 pktw-text-xs"
								onClick={() => void runFindPath()}
								disabled={!pathTarget || pathLoading}
							>
								{pathLoading ? '…' : 'Run'}
							</Button>
						</div>
					</div>
				) : null}
			</div>

			{findPath && (pathResult || pathError) ? (
				<div className="pktw-mt-2 pktw-max-h-[100px] pktw-overflow-y-auto pktw-rounded pktw-bg-[#f9fafb] pktw-p-2 pktw-text-xs pktw-text-[#6b7280]">
					{pathError ? <div className="pktw-text-red-600">{pathError}</div> : null}
					{pathResult?.paths?.length ? (
						<div className="pktw-whitespace-pre-wrap">{pathResult.paths.join('\n')}</div>
					) : pathResult?.markdown ? (
						<div className="pktw-whitespace-pre-wrap">{pathResult.markdown}</div>
					) : null}
				</div>
			) : null}
		</Section>
	);

	const content = embedBelowGraph ? (
		<div className={cn('pktw-w-full pktw-max-w-3xl', hops ? 'pktw-grid pktw-grid-cols-2 pktw-gap-x-8' : '')}>
			{hops ? (
				<div className="pktw-space-y-0 pktw-min-w-0">
					<Section className="pktw-flex pktw-items-center pktw-gap-2">
						<Focus className="pktw-w-3.5 pktw-h-3.5 pktw-text-[#6b7280]" />
						<span className="pktw-text-[11px] pktw-text-[#6b7280]">Hops</span>
						{([1, 2, 3] as const).map((h) => (
							<Button
								key={h}
								size="sm"
								variant="ghost"
								className={cn(
									'pktw-h-6 pktw-px-2 pktw-text-xs',
									hops.value === h
										? 'pktw-bg-[#f5f3ff] pktw-text-[#7c3aed]'
										: ''
								)}
								onClick={() => hops.onChange(h as ToolbarHopsValue)}
							>
								{h}
							</Button>
						))}
					</Section>
				</div>
			) : null}
			<div className="pktw-space-y-0 pktw-min-w-0">
				{pathSection}
			</div>
		</div>
	) : (
		<div className="pktw-space-y-0">
			{pathSection}
		</div>
	);

	const panelClassName =
		'pktw-bg-white pktw-border pktw-border-[#e5e7eb] pktw-rounded-lg pktw-shadow-lg pktw-p-4 pktw-min-w-[220px] pktw-z-10';
	const belowGraphClassName =
		'pktw-w-full pktw-p-0 pktw-border-0 pktw-shadow-none pktw-bg-transparent pktw-min-w-0';
	const style =
		embedInGraph || embedBelowGraph
			? undefined
			: position
				? { bottom: position.bottom, left: position.left }
				: { bottom: 12, left: 12 };

	const panel = (
		<div
			className={
				embedBelowGraph
					? belowGraphClassName
					: embedInGraph
						? `pktw-absolute pktw-bottom-2 pktw-left-2 ${panelClassName}`
						: `pktw-fixed pktw-z-[9998] ${panelClassName}`
			}
			style={style}
		>
			{content}
		</div>
	);

	if (embedBelowGraph) return panel;
	if (embedInGraph) return panel;
	return createPortal(panel, document.body);
};
