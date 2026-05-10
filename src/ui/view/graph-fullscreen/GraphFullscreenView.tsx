import React from 'react';
import { IconName, ItemView, Notice, WorkspaceLeaf } from 'obsidian';
import { ReactRenderer } from '@/ui/react/ReactRenderer';
import { MultiLensGraph } from '@/ui/component/mine/multi-lens-graph/MultiLensGraph';
import { useGraphAgentStore } from '@/ui/view/quick-search/store/graphAgentStore';
import { createOpenSourceCallback } from '@/ui/view/quick-search/callbacks/open-source-file';
import { saveAiGraphToMarkdown } from '@/ui/view/quick-search/callbacks/save-ai-analyze-to-md';
import { AppContext } from '@/app/context/AppContext';

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

	const handleSaveToVault = React.useCallback(async () => {
		const currentGraphData = useGraphAgentStore.getState().graphData;
		if (!currentGraphData) {
			new Notice('No graph data to save');
			return;
		}
		try {
			const ctx = AppContext.getInstance();
			const saveFolder = ctx.settings.search?.aiAnalysisAutoSaveFolder?.trim() || 'AI-Analysis';
			const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
			const fileName = `Graph-${timestamp}`;
			const summary = `${currentGraphData.nodes.length} nodes, ${currentGraphData.edges.length} edges`;
			const { path } = await saveAiGraphToMarkdown({
				folderPath: saveFolder,
				fileName,
				query: '',
				summary,
				graphData: currentGraphData,
				lensHint: 'topology',
			});
			new Notice(`Graph saved: ${path}`);
		} catch (e) {
			new Notice(`Failed to save graph: ${e instanceof Error ? e.message : String(e)}`);
		}
	}, []);

	return (
		<div style={{ width: '100%', height: '100%' }}>
			<MultiLensGraph
				graphData={graphData}
				defaultLens="topology"
				showControls
				showMiniMap
				onNodeClick={handleOpen}
				onSaveToVault={handleSaveToVault}
				className="pktw-h-full pktw-w-full"
			/>
		</div>
	);
}
