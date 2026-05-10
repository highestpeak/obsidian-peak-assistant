/**
 * Gap Analysis ItemView — Obsidian panel for structural hole visualization.
 *
 * Layout: Header + horizontal split (60% CommunityMap, 40% GapDetailsSidebar)
 * + BridgeNodeList + SuggestedActions below.
 */

import React, { useEffect } from 'react';
import { type IconName, ItemView, WorkspaceLeaf } from 'obsidian';
import { ReactRenderer } from '@/ui/react/ReactRenderer';
import { Button } from '@/ui/component/shared-ui/button';
import { RefreshCw, Loader2 } from 'lucide-react';
import { useGapAnalysisStore } from './gapAnalysisStore';
import { CommunityMap } from './CommunityMap';
import { GapDetailsSidebar } from './GapDetailsSidebar';
import { BridgeNodeList } from './BridgeNodeList';
import { SuggestedActions } from './SuggestedActions';

export const GAP_ANALYSIS_VIEW_TYPE = 'peak-gap-analysis';

export class GapAnalysisView extends ItemView {
	private reactRenderer: ReactRenderer | null = null;

	constructor(leaf: WorkspaceLeaf) {
		super(leaf);
	}

	getViewType(): string {
		return GAP_ANALYSIS_VIEW_TYPE;
	}

	getDisplayText(): string {
		return 'Gap Analysis';
	}

	getIcon(): IconName {
		return 'layers';
	}

	async onOpen(): Promise<void> {
		this.containerEl.empty();
		this.reactRenderer = new ReactRenderer(this.containerEl);
		this.reactRenderer.render(<GapAnalysisPanel />);
	}

	async onClose(): Promise<void> {
		if (this.reactRenderer) {
			this.reactRenderer.unmount();
			this.reactRenderer = null;
		}
		this.containerEl.empty();
	}
}

function formatTimeAgo(ts: number | null): string {
	if (!ts) return 'Never';
	const diff = Date.now() - ts;
	const minutes = Math.floor(diff / 60000);
	if (minutes < 1) return 'Just now';
	if (minutes < 60) return `${minutes}m ago`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h ago`;
	const days = Math.floor(hours / 24);
	return `${days}d ago`;
}

function GapAnalysisPanel() {
	const isLoading = useGapAnalysisStore(s => s.isLoading);
	const lastComputedAt = useGapAnalysisStore(s => s.lastComputedAt);
	const communities = useGapAnalysisStore(s => s.communities);
	const triggerRecompute = useGapAnalysisStore(s => s.triggerRecompute);
	const loadData = useGapAnalysisStore(s => s.loadData);

	useEffect(() => {
		loadData();
	}, []);

	return (
		<div className="pktw-flex pktw-flex-col pktw-h-full pktw-bg-pk-background">
			<GapAnalysisHeader
				isLoading={isLoading}
				lastComputedAt={lastComputedAt}
				communityCount={communities.length}
				onRefresh={triggerRecompute}
			/>
			<div className="pktw-flex pktw-flex-1 pktw-min-h-0">
				<div className="pktw-w-[60%] pktw-h-full pktw-border-r pktw-border-pk-border">
					<CommunityMap />
				</div>
				<div className="pktw-w-[40%] pktw-h-full pktw-overflow-y-auto">
					<GapDetailsSidebar />
				</div>
			</div>
			<div className="pktw-border-t pktw-border-pk-border pktw-px-4 pktw-py-2 pktw-overflow-y-auto pktw-max-h-[240px]">
				<BridgeNodeList />
				<SuggestedActions />
			</div>
		</div>
	);
}

function GapAnalysisHeader({
	isLoading,
	lastComputedAt,
	communityCount,
	onRefresh,
}: {
	isLoading: boolean;
	lastComputedAt: number | null;
	communityCount: number;
	onRefresh: () => void;
}) {
	return (
		<div className="pktw-flex pktw-items-center pktw-gap-3 pktw-px-4 pktw-py-2 pktw-border-b pktw-border-pk-border">
			<span className="pktw-text-sm pktw-font-medium pktw-text-[#2e3338]">
				Gap Analysis
			</span>
			<Button
				variant="ghost"
				size="sm"
				onClick={onRefresh}
				disabled={isLoading}
				className="pktw-gap-1"
				style={{ cursor: 'pointer' }}
			>
				{isLoading ? (
					<Loader2 className="pktw-w-3.5 pktw-h-3.5 pktw-animate-spin" />
				) : (
					<RefreshCw className="pktw-w-3.5 pktw-h-3.5" />
				)}
				Refresh
			</Button>
			<div className="pktw-flex-1" />
			<span className="pktw-text-[10px] pktw-text-pk-foreground-muted">
				Last computed: {formatTimeAgo(lastComputedAt)}
				{communityCount > 0 && ` -- ${communityCount} communities`}
			</span>
		</div>
	);
}
