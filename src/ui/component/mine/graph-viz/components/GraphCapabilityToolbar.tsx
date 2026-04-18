/**
 * Hops and/or Find path controls for GraphVisualization.
 * Rendered in the below-graph area when graphBelowExtraAnalysisArea.hops / .findPath is provided.
 */

import { SLICE_CAPS } from '@/core/constant';
import React, { useState, useCallback, useId } from 'react';
import { Focus, Route } from 'lucide-react';
import { Button } from '@/ui/component/shared-ui/button';
import { cn } from '@/ui/react/lib/utils';
import type { GraphBelowExtraAnalysisAreaConfig, ToolbarHopsValue, FindPathResult } from '../types';

export type GraphCapabilityToolbarProps = {
	graphBelowExtraAnalysisArea: GraphBelowExtraAnalysisAreaConfig;
};

export const GraphBelowExtraAnalysisArea: React.FC<GraphCapabilityToolbarProps> = ({ graphBelowExtraAnalysisArea }) => {
	const { hops, findPath } = graphBelowExtraAnalysisArea;
	const datalistId = useId();

	// Find path state (owned by Viz)
	const [selectedPathTarget, setSelectedPathTarget] = useState<string | null>(null);
	const [pathLoading, setPathLoading] = useState(false);
	const [pathError, setPathError] = useState<string | null>(null);
	const [pathResult, setPathResult] = useState<FindPathResult>(null);

	const runPath = useCallback(async () => {
		if (!findPath) return;
		const start = findPath.pathStart?.trim();
		const target = selectedPathTarget?.trim();
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
	}, [findPath, selectedPathTarget]);

	const candidatePaths = findPath?.candidatePaths ?? [];
	const pathStart = findPath?.pathStart ?? null;

	return (
		<>
			{hops ? (
				<div className="pktw-flex-shrink-0 pktw-flex pktw-items-center pktw-gap-2 pktw-py-1.5">
					<span className="pktw-text-[11px] pktw-font-medium pktw-text-[#6b7280] pktw-flex pktw-items-center pktw-gap-1.5">
						<Focus className="pktw-w-3.5 pktw-h-3.5" />
						Hops
						<span className="pktw-inline-flex pktw-rounded-md pktw-border pktw-border-[#e5e7eb] pktw-overflow-hidden">
							{([1, 2, 3] as const).map((h) => (
								<Button
									key={h}
									size="sm"
									variant="ghost"
									className={cn(
										'pktw-h-6 pktw-w-7 pktw-px-0 pktw-text-xs pktw-rounded-none pktw-border-0',
										hops.value === h
											? 'pktw-bg-[#7c3aed] pktw-text-white hover:pktw-bg-[#6d28d9]'
											: 'pktw-text-[#6b7280] hover:pktw-bg-[#f5f3ff]',
									)}
									onClick={() => hops.onChange(h as ToolbarHopsValue)}
								>
									{h}
								</Button>
							))}
						</span>
					</span>
				</div>
			) : null}

			{findPath ? (
				<>
					<div className="pktw-flex-shrink-0 pktw-flex pktw-items-center pktw-gap-2 pktw-py-1.5 pktw-border-t pktw-border-[#e5e7eb]">
						<span className="pktw-text-[11px] pktw-font-medium pktw-text-[#6b7280] pktw-flex pktw-items-center pktw-gap-1">
							<Route className="pktw-w-3.5 pktw-h-3.5" />
							Find path
						</span>
						<input
							type="text"
							className="pktw-h-6 pktw-flex-1 pktw-min-w-0 pktw-max-w-[240px] pktw-text-xs pktw-rounded-lg pktw-border pktw-border-[#e5e7eb] pktw-bg-white pktw-px-2 pktw-truncate pktw-shadow-none focus:pktw-outline-none focus:pktw-ring-0"
							value={selectedPathTarget ?? ''}
							onChange={(e) => setSelectedPathTarget(e.target.value.trim() || null)}
							placeholder="Target note path"
							title="Target note for Find path"
							list={datalistId}
						/>
						<datalist id={datalistId}>
							{candidatePaths.slice(0, SLICE_CAPS.graphViz.candidatePathsToolbar).map((item) => (
								<option key={item.path} value={item.path}>
									{item.label || item.path}
								</option>
							))}
						</datalist>
						<Button
							size="sm"
							variant="ghost"
							className="pktw-h-6 pktw-px-1.5 pktw-text-xs"
							onClick={() => void runPath()}
							disabled={!selectedPathTarget || pathLoading}
						>
							{pathLoading ? '…' : 'Run'}
						</Button>
					</div>
					{(pathResult || pathError) ? (
						<div className="pktw-flex-shrink-0 pktw-border-t pktw-border-[#e5e7eb] pktw-max-h-[120px] pktw-overflow-y-auto pktw-py-1.5">
							{pathError ? (
								<div className="pktw-text-xs pktw-text-red-600">{pathError}</div>
							) : null}
							{pathResult ? (
								<>
									{pathStart && selectedPathTarget ? (
										<div className="pktw-text-[11px] pktw-text-[#6b7280] pktw-mb-1">
											From: {pathStart} → To: {selectedPathTarget}
										</div>
									) : null}
									<div className="pktw-text-xs pktw-whitespace-pre-wrap">
										{pathResult?.paths?.length
											? pathResult.paths.join('\n')
											: pathResult?.markdown ?? ''}
									</div>
								</>
							) : null}
						</div>
					) : null}
				</>
			) : null}
		</>
	);
};
