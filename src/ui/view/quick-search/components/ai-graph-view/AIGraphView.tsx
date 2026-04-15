import React from 'react';
import { MultiLensGraph } from '@/ui/component/mine/multi-lens-graph/MultiLensGraph';
import { useAIGraphStore } from '@/ui/view/quick-search/store/aiGraphStore';
import { Loader2 } from 'lucide-react';

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

	return (
		<div className="pktw-h-[500px] pktw-w-full">
			<MultiLensGraph
				graphData={graphData}
				onNodeClick={onOpenPath}
				className="pktw-h-full pktw-w-full"
				showControls
				showMiniMap
			/>
		</div>
	);
};
