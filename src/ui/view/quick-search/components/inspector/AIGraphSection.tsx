import React, { useEffect, useState } from 'react';
import { ExternalLink, Network } from 'lucide-react';
import { Button } from '@/ui/component/shared-ui/button';
import { cn } from '@/ui/react/lib/utils';
import { humanReadableTime } from '@/core/utils/date-utils';
import { AppContext } from '@/app/context/AppContext';
import type { AIAnalysisHistoryRecord } from '@/service/AIAnalysisHistoryService';
import { useSharedStore } from '../../store';
import { useSearchSessionStore } from '../../store/searchSessionStore';

export interface AIGraphSectionProps {
	currentPath: string;
	searchQuery: string;
}

export const AIGraphSection: React.FC<AIGraphSectionProps> = ({
	currentPath,
	searchQuery,
}) => {
	const [pastResult, setPastResult] = useState<AIAnalysisHistoryRecord | null>(null);
	const [loading, setLoading] = useState(true);

	const setActiveTab = useSharedStore((s) => s.setActiveTab);
	const setAnalysisMode = useSearchSessionStore((s) => s.setAnalysisMode);

	useEffect(() => {
		let cancelled = false;
		setLoading(true);

		const svc = AppContext.getAIAnalysisHistoryService();
		svc.findRelatedAIGraph(searchQuery)
			.then((result) => {
				if (!cancelled) {
					setPastResult(result);
					setLoading(false);
				}
			})
			.catch(() => {
				if (!cancelled) {
					setPastResult(null);
					setLoading(false);
				}
			});

		return () => { cancelled = true; };
	}, [searchQuery]);

	const handleOpenPastResult = () => {
		if (!pastResult?.vault_rel_path) return;
		AppContext.getInstance().app.workspace.openLinkText(pastResult.vault_rel_path, '', 'window' as any);
	};

	const handleGenerate = () => {
		setAnalysisMode('aiGraph');
		setActiveTab('ai');
	};

	if (loading) {
		return <span className="pktw-text-xs pktw-text-pk-foreground-muted">Loading...</span>;
	}

	return (
		<div className="pktw-flex pktw-flex-col pktw-gap-2">
			{pastResult && (
				<div className="pktw-flex pktw-flex-col pktw-gap-1 pktw-p-2 pktw-rounded pktw-bg-[#faf5ff] pktw-border pktw-border-[#e9d5ff]">
					<div className="pktw-flex pktw-items-start pktw-justify-between pktw-gap-2">
						<div className="pktw-flex pktw-flex-col pktw-gap-0.5 pktw-min-w-0">
							<span className="pktw-text-xs pktw-font-medium pktw-text-pk-foreground pktw-truncate" title={pastResult.query ?? ''}>
								{pastResult.query ?? '(untitled)'}
							</span>
							<span className="pktw-text-[10px] pktw-text-pk-foreground-muted">
								{pastResult.graph_nodes_count ?? 0} nodes · {pastResult.graph_edges_count ?? 0} edges · {humanReadableTime(pastResult.created_at_ts)}
							</span>
						</div>
						<Button
							variant="ghost"
							size="xs"
							className="pktw-shadow-none pktw-h-6 pktw-px-1.5 pktw-text-[10px] pktw-text-pk-accent hover:pktw-bg-[#f5f3ff] pktw-shrink-0"
							onClick={handleOpenPastResult}
							title="Open in new window"
						>
							<ExternalLink className="pktw-w-3 pktw-h-3 pktw-mr-0.5" />
							New window
						</Button>
					</div>
				</div>
			)}

			<div className="pktw-flex pktw-flex-col pktw-gap-0.5">
				<Button
					variant="outline"
					size="sm"
					className={cn(
						'pktw-shadow-none pktw-w-full pktw-justify-start pktw-gap-1.5',
						'pktw-text-xs pktw-text-pk-foreground hover:pktw-text-pk-accent hover:pktw-border-[#c4b5fd]',
					)}
					onClick={handleGenerate}
				>
					<Network className="pktw-w-3.5 pktw-h-3.5 pktw-text-pk-accent" />
					Generate AI Graph
				</Button>
				<span className="pktw-text-[10px] pktw-text-pk-foreground-muted pktw-pl-1">Uses AI credits</span>
			</div>
		</div>
	);
};
