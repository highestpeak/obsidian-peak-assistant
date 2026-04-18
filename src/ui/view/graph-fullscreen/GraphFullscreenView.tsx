import React from 'react';
import { IconName, ItemView, WorkspaceLeaf } from 'obsidian';
import { ReactRenderer } from '@/ui/react/ReactRenderer';
import { MultiLensGraph } from '@/ui/component/mine/multi-lens-graph/MultiLensGraph';
import { useGraphAgentStore } from '@/ui/view/quick-search/store/graphAgentStore';
import { createOpenSourceCallback } from '@/ui/view/quick-search/callbacks/open-source-file';

export const GRAPH_FULLSCREEN_VIEW_TYPE = 'peak-graph-fullscreen';

export class GraphFullscreenView extends ItemView {
	private reactRenderer: ReactRenderer | null = null;

	constructor(leaf: WorkspaceLeaf) {
		super(leaf);
	}

	getViewType(): string {
		return GRAPH_FULLSCREEN_VIEW_TYPE;
	}

	getDisplayText(): string {
		return 'AI Knowledge Graph';
	}

	getIcon(): IconName {
		return 'git-fork';
	}

	async onOpen(): Promise<void> {
		this.containerEl.empty();
		this.reactRenderer = new ReactRenderer(this.containerEl);
		this.reactRenderer.render(<GraphFullscreenContent />);
	}

	async onClose(): Promise<void> {
		if (this.reactRenderer) {
			this.reactRenderer.unmount();
			this.reactRenderer = null;
		}
		this.containerEl.empty();
	}
}

function GraphFullscreenContent() {
	const graphData = useGraphAgentStore(s => s.graphData);
	const handleOpen = React.useMemo(() => createOpenSourceCallback(), []);

	return (
		<div style={{ width: '100%', height: '100%' }}>
			<MultiLensGraph
				graphData={graphData}
				defaultLens="topology"
				showControls
				showMiniMap
				onNodeClick={handleOpen}
				className="pktw-h-full pktw-w-full"
			/>
		</div>
	);
}
