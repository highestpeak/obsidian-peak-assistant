import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { Button } from '@/ui/component/shared-ui/button';
import { cn } from '@/ui/react/lib/utils';
import { Brain, Maximize2 } from 'lucide-react';
import { BrainOff } from '@/ui/component/icon';
import { LinksTab } from './LinksSection';
import { GraphSection } from './GraphSection';
import { DocumentAnalysisAggregator, type DocumentAnalysisSummary } from '@/service/DocumentAnalysisAggregator';

/** Semantic toggle (same pattern as Web Globe/GlobeOff): Brain when on, BrainOff with slash when off. */
const SemanticButton: React.FC<{
	on: boolean;
	onClick: () => void;
	title?: string;
}> = ({ on, onClick, title }) => (
	<Button
		size="sm"
		variant="ghost"
		title={title ?? (on ? 'Include semantic (on)' : 'Include semantic (off)')}
		className={cn(
			'pktw-h-6 pktw-px-1.5 pktw-text-xs',
			on ? 'pktw-bg-[#f5f3ff] pktw-text-[#7c3aed]' : 'pktw-border-0 pktw-bg-transparent pktw-text-[#9ca3af]'
		)}
		onClick={onClick}
	>
		{on ? <Brain className="pktw-w-3.5 pktw-h-3.5" /> : <BrainOff className="pktw-w-3.5 pktw-h-3.5" />}
	</Button>
);

const HistorySection: React.FC<{ currentPath: string | null; onHasContent?: (has: boolean) => void }> = ({ currentPath, onHasContent }) => {
	const [analyses, setAnalyses] = useState<DocumentAnalysisSummary[]>([]);

	useEffect(() => {
		if (!currentPath) { setAnalyses([]); onHasContent?.(false); return; }
		let cancelled = false;
		const aggregator = new DocumentAnalysisAggregator();
		aggregator.findForDocument(currentPath)
			.then(data => {
				if (!cancelled) {
					setAnalyses(data);
					onHasContent?.(data.length > 0);
				}
			})
			.catch(() => {
				if (!cancelled) {
					setAnalyses([]);
					onHasContent?.(false);
				}
			});
		return () => { cancelled = true; };
	}, [currentPath, onHasContent]);

	if (!currentPath || analyses.length === 0) return null;

	return (
		<div className="pktw-flex pktw-flex-col pktw-gap-1">
			{analyses.map(a => (
				<div key={a.id} className="pktw-flex pktw-flex-col pktw-gap-0.5 pktw-py-1 pktw-border-b pktw-border-[#f3f4f6] last:pktw-border-0">
					<span className="pktw-text-xs pktw-font-medium pktw-text-[#374151] pktw-truncate">
						{a.title ?? a.query ?? '(untitled)'}
					</span>
					<span className="pktw-text-xs pktw-text-[#9ca3af]">
						{new Date(a.createdAtTs).toLocaleDateString()}
						{a.sourcesCount != null ? ` · ${a.sourcesCount} sources` : ''}
					</span>
				</div>
			))}
		</div>
	);
};

const InspectorSection = React.forwardRef<HTMLDivElement, {
	title: string;
	titleAppend?: React.ReactNode;
	children: React.ReactNode;
}>(({ title, titleAppend, children }, ref) => (
	<div ref={ref} className="pktw-flex-shrink-0  pktw-border-b pktw-border-[#e5e7eb] pktw-px-4">
		<div className="pktw-flex pktw-items-center pktw-gap-2 pktw-px-4 pktw-pt-2 pktw-pb-1 pktw-bg-[#fafafa] pktw-rounded-lg">
			<span className="pktw-text-xs pktw-font-medium pktw-text-[#6b7280]">{title}</span>
			{titleAppend}
		</div>
		<div className="pktw-py-2 pktw-px-4">
			{children}
		</div>
	</div>
));

/**
 * Inspector panel: nav bar + Links + Graph (auto-run) + Find path row.
 * Links/Graph auto-run on open; only Find path uses a button.
 */
export const InspectorPanel: React.FC<{
	currentPath: string | null;
	onClose?: () => void;
	className?: string;
}> = ({ currentPath, onClose, className }) => {
	const [linksIncludeSemantic, setLinksIncludeSemantic] = useState(true);
	const [graphIncludeSemantic, setGraphIncludeSemantic] = useState(true);
	const [graphFullscreenOpen, setGraphFullscreenOpen] = useState(false);
	const [hasHistory, setHasHistory] = useState(false);

	const linksRef = useRef<HTMLDivElement>(null);
	const graphRef = useRef<HTMLDivElement>(null);
	const historyRef = useRef<HTMLDivElement>(null);

	const allSemanticOn = linksIncludeSemantic && graphIncludeSemantic;
	const setAllSemantic = (on: boolean) => {
		setLinksIncludeSemantic(on);
		setGraphIncludeSemantic(on);
	};

	const scrollTo = (ref: React.RefObject<HTMLDivElement | null>) => {
		ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
	};

	return (
		<div
			className={cn(
				'pktw-flex pktw-flex-col pktw-h-full pktw-min-h-0 pktw-overflow-y-auto pktw-border-t pktw-border-[#e5e7eb] pktw-bg-white',
				className
			)}
		>
			{/* Top nav bar: sticky, stays visible when scrolling */}
			<div className="pktw-sticky pktw-top-0 pktw-z-10 pktw-flex-shrink-0 pktw-px-4 pktw-pt-2 pktw-pb-1 pktw-bg-white">
				<div className="pktw-flex pktw-items-center pktw-gap-1 pktw-p-2 pktw-rounded-md pktw-border pktw-border-[#e5e7eb] pktw-bg-white pktw-w-fit">
					<SemanticButton
						on={allSemanticOn}
						onClick={() => setAllSemantic(!allSemanticOn)}
						title={allSemanticOn ? 'Semantic: all on (click to turn all off)' : 'Semantic: some off (click to turn all on)'}
					/>
					<Button
						size="sm"
						variant="ghost"
						className="pktw-h-7 pktw-px-2 pktw-text-xs"
						onClick={() => scrollTo(linksRef)}
					>
						Links
					</Button>
					<Button
						size="sm"
						variant="ghost"
						className="pktw-h-7 pktw-px-2 pktw-text-xs"
						onClick={() => scrollTo(graphRef)}
					>
						Graph
					</Button>
					<Button
						size="sm"
						variant="ghost"
						className="pktw-h-7 pktw-px-2 pktw-text-xs"
						onClick={() => scrollTo(historyRef)}
					>
						History
					</Button>
				</div>
			</div>

			{/* Links: title then Semantic immediately after (left group) */}
			<InspectorSection
				ref={linksRef}
				title="Links"
				titleAppend={
					<SemanticButton on={linksIncludeSemantic} onClick={() => setLinksIncludeSemantic((v) => !v)} />
				}
				children={
					<LinksTab
						currentPath={currentPath}
						linksIncludeSemantic={linksIncludeSemantic}
						onClose={onClose}
					/>
				}
			/>

			{/* Graph: title row = "Graph" then Semantic then Hops; viz; path result; Find path row at bottom */}
			<InspectorSection
				ref={graphRef}
				title="Graph"
				titleAppend={
					<>
						<SemanticButton on={graphIncludeSemantic} onClick={() => setGraphIncludeSemantic((v) => !v)} />
						<Button
							variant="ghost"
							size="icon"
							className="pktw-shadow-none pktw-rounded-md pktw-border pktw-h-6 pktw-w-6"
							title="Fullscreen"
							onClick={() => setGraphFullscreenOpen(true)}
						>
							<Maximize2 className="pktw-w-3.5 pktw-h-3.5" />
						</Button>
					</>
				}
				children={
					<GraphSection
						ref={graphRef}
						graphIncludeSemantic={graphIncludeSemantic}
						currentPath={currentPath}
						onClose={onClose}
						fullscreenOpen={graphFullscreenOpen}
						onFullscreenClose={() => setGraphFullscreenOpen(false)}
					/>
				}
			/>

			{/* History: analyses related to the current document */}
			{hasHistory && (
				<InspectorSection
					ref={historyRef}
					title="History"
					children={
						<HistorySection currentPath={currentPath} onHasContent={setHasHistory} />
					}
				/>
			)}
		</div>
	);
};
