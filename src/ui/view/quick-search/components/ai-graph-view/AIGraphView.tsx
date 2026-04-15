import React from 'react';
import { MultiLensGraph } from '@/ui/component/mine/multi-lens-graph/MultiLensGraph';
import { useAIGraphStore } from '@/ui/view/quick-search/store/aiGraphStore';
import { Loader2, Save } from 'lucide-react';
import { Button } from '@/ui/component/shared-ui/button';
import { saveAiGraphToMarkdown } from '@/ui/view/quick-search/callbacks/save-ai-analyze-to-md';
import { Notice } from 'obsidian';

export const AIGraphView: React.FC<{ onOpenPath: (path: string) => void }> = ({ onOpenPath }) => {
	const graphData = useAIGraphStore((s) => s.graphData);
	const loading = useAIGraphStore((s) => s.loading);

	if (loading) {
		return (
			<div className="pktw-flex pktw-items-center pktw-justify-center pktw-h-[400px] pktw-text-[var(--text-muted)] pktw-text-sm">
				<Loader2 className="pktw-w-5 pktw-h-5 pktw-animate-spin pktw-mr-2" />
				Building knowledge graph...
			</div>
		);
	}

	const handleSave = async () => {
		const { graphData, query, activeLens } = useAIGraphStore.getState();
		if (!graphData) return;
		const result = await saveAiGraphToMarkdown({
			folderPath: 'ai-analysis',
			fileName: `AI Graph - ${query.slice(0, 40)}`,
			query,
			summary: `Knowledge graph with ${graphData.nodes.length} nodes across ${graphData.availableLenses.length} lenses.`,
			graphData,
			lensHint: activeLens,
		});
		new Notice(`AI Graph saved to ${result.path}`);
	};

	return (
		<div className="pktw-h-[500px] pktw-w-full">
			<MultiLensGraph
				graphData={graphData}
				onNodeClick={onOpenPath}
				className="pktw-h-full pktw-w-full"
				showControls
				showMiniMap
			/>
			<div className="pktw-flex pktw-justify-end pktw-p-2">
				<Button variant="outline" size="sm" onClick={handleSave} className="pktw-gap-1" style={{ cursor: 'pointer' }}>
					<Save className="pktw-w-3.5 pktw-h-3.5" />
					Save to vault
				</Button>
			</div>
		</div>
	);
};
