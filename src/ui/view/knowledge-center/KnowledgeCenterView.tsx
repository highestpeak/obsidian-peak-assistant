import React, { useEffect, useState } from 'react';
import { type IconName, ItemView, type WorkspaceLeaf } from 'obsidian';
import {
	Activity,
	Brain,
	Database,
	FileSearch,
	Layers,
	RefreshCw,
	Tags,
	Zap,
} from 'lucide-react';
import { ReactRenderer } from '@/ui/react/ReactRenderer';
import { createReactElementWithServices } from '@/ui/react/ReactElementFactory';
import type { AppContext } from '@/app/context/AppContext';
import { Button } from '@/ui/component/shared-ui/button';
import { cn } from '@/ui/react/lib/utils';
import { IndexService, type GetIndexStatusResponse } from '@/service/search/index/indexService';
import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';
import {
	analyzeVaultIntuition,
	openBatchTagSuggestions,
	openGapAnalysis,
	openRelatedNotes,
	openVaultXRay,
	recomputeGapAnalysis,
	refreshHubSummaries,
	refreshRelatedNotes,
	runFullIndexPipeline,
	runSearchFastIndex,
} from '@/app/commands/PeakCommandActions';

export const KNOWLEDGE_CENTER_VIEW_TYPE = 'peak-knowledge-center';

export class KnowledgeCenterView extends ItemView {
	private reactRenderer: ReactRenderer | null = null;

	constructor(
		leaf: WorkspaceLeaf,
		private readonly appContext: AppContext,
	) {
		super(leaf);
	}

	getViewType(): string {
		return KNOWLEDGE_CENTER_VIEW_TYPE;
	}

	getDisplayText(): string {
		return 'Knowledge Center';
	}

	getIcon(): IconName {
		return 'brain';
	}

	async onOpen(): Promise<void> {
		this.containerEl.empty();
		this.containerEl.addClass('peak-knowledge-center');
		this.reactRenderer = new ReactRenderer(this.containerEl);
		this.reactRenderer.render(
			createReactElementWithServices(KnowledgeCenterPanel, {}, this.appContext),
		);
	}

	async onClose(): Promise<void> {
		this.reactRenderer?.unmount();
		this.reactRenderer = null;
		this.containerEl.empty();
	}
}

function formatTime(ts: number | null): string {
	if (!ts) return 'Never indexed';
	const d = new Date(ts);
	return d.toLocaleString();
}

function KnowledgeCenterPanel() {
	const [indexStatus, setIndexStatus] = useState<GetIndexStatusResponse | null>(null);
	const [loadingStatus, setLoadingStatus] = useState(false);

	const loadStatus = async () => {
		if (!sqliteStoreManager.isInitialized()) {
			setIndexStatus(null);
			return;
		}
		setLoadingStatus(true);
		try {
			const status = await IndexService.getInstance().getIndexStatus();
			setIndexStatus(status);
		} finally {
			setLoadingStatus(false);
		}
	};

	useEffect(() => {
		void loadStatus();
	}, []);

	const runAndRefresh = async (fn: () => void | Promise<void>) => {
		await fn();
		await loadStatus();
	};

	return (
		<div className="pktw-flex pktw-h-full pktw-flex-col pktw-bg-background">
			<div className="pktw-flex pktw-items-center pktw-justify-between pktw-gap-3 pktw-border-b pktw-border-border pktw-px-5 pktw-py-4">
				<div className="pktw-flex pktw-flex-col pktw-gap-0.5">
					<span className="pktw-text-sm pktw-font-semibold">Knowledge Center</span>
					<span className="pktw-text-xs pktw-text-muted-foreground">
						Vault health, knowledge graph operations, ambient suggestions, and index status.
					</span>
				</div>
				<Button variant="outline" size="sm" onClick={loadStatus} disabled={loadingStatus}>
					<RefreshCw className={cn('pktw-mr-1.5 pktw-h-3.5 pktw-w-3.5', loadingStatus && 'pktw-animate-spin')} />
					Refresh
				</Button>
			</div>

			<div className="pktw-flex-1 pktw-overflow-y-auto pktw-p-5 pktw-space-y-5">
				<IndexStatusCard
					status={indexStatus}
					loading={loadingStatus}
					onUpdate={() => runAndRefresh(runSearchFastIndex)}
					onFullPipeline={() => runAndRefresh(runFullIndexPipeline)}
				/>

				<KnowledgeSection
					label="Explore"
					actions={[
						{ label: 'Related Notes', description: 'Open the right-side ambient suggestions panel.', icon: Zap, run: openRelatedNotes },
						{ label: 'Vault X-Ray', description: 'Review vault health signals and repair opportunities.', icon: Activity, run: openVaultXRay },
						{ label: 'Gap Analysis', description: 'Inspect bridge nodes and structural holes.', icon: Layers, run: openGapAnalysis },
						{ label: 'Batch Tag Suggestions', description: 'Suggest tags for notes across a selected folder.', icon: Tags, run: openBatchTagSuggestions },
					]}
				/>

				<KnowledgeSection
					label="Refresh Knowledge"
					actions={[
						{ label: 'Refresh Related Notes', description: 'Re-run ambient suggestions for the current context.', icon: Zap, run: refreshRelatedNotes },
						{ label: 'Refresh Hub Summaries', description: 'Process queued precompiled hub summaries.', icon: FileSearch, run: refreshHubSummaries },
						{ label: 'Recompute Gap Analysis', description: 'Force structural-hole analysis to run again.', icon: Layers, run: recomputeGapAnalysis },
						{ label: 'Analyze Vault Intuition', description: 'Regenerate the high-level vault intuition map.', icon: Brain, run: analyzeVaultIntuition },
					]}
				/>
			</div>
		</div>
	);
}

function IndexStatusCard({
	status,
	loading,
	onUpdate,
	onFullPipeline,
}: {
	status: GetIndexStatusResponse | null;
	loading: boolean;
	onUpdate: () => void | Promise<void>;
	onFullPipeline: () => void | Promise<void>;
}) {
	return (
		<div className="pktw-rounded-md pktw-border pktw-border-border pktw-bg-background pktw-p-4">
			<div className="pktw-flex pktw-items-start pktw-justify-between pktw-gap-4">
				<div className="pktw-flex pktw-gap-3">
					<Database className="pktw-mt-0.5 pktw-h-4 pktw-w-4 pktw-text-muted-foreground" />
					<div className="pktw-flex pktw-flex-col pktw-gap-1">
						<span className="pktw-text-sm pktw-font-semibold">Index Status</span>
						<span className="pktw-text-xs pktw-text-muted-foreground">
							{status?.indexedDocs == null ? 'No indexed document count available.' : `${status.indexedDocs.toLocaleString()} indexed documents.`}
						</span>
						<span className="pktw-text-xs pktw-text-muted-foreground">
							Last built: {formatTime(status?.indexBuiltAt ?? null)}
						</span>
					</div>
				</div>
				<div className="pktw-flex pktw-flex-wrap pktw-justify-end pktw-gap-2">
					<Button variant="outline" size="sm" onClick={onUpdate} disabled={loading}>
						Update Index
					</Button>
					<Button variant="ghost" size="sm" onClick={onFullPipeline} disabled={loading}>
						Full Pipeline
					</Button>
				</div>
			</div>
		</div>
	);
}

interface KnowledgeAction {
	label: string;
	description: string;
	icon: React.ElementType;
	run: () => void | Promise<void>;
}

function KnowledgeSection({
	label,
	actions,
}: {
	label: string;
	actions: KnowledgeAction[];
}) {
	return (
		<div className="pktw-flex pktw-flex-col pktw-gap-2">
			<span className="pktw-text-[11px] pktw-font-semibold pktw-uppercase pktw-tracking-wider pktw-text-muted-foreground">
				{label}
			</span>
			<div className="pktw-grid pktw-grid-cols-2 pktw-gap-2">
				{actions.map(action => (
					<KnowledgeActionButton key={action.label} action={action} />
				))}
			</div>
		</div>
	);
}

function KnowledgeActionButton({ action }: { action: KnowledgeAction }) {
	const Icon = action.icon;
	return (
		<Button
			variant="ghost"
			className="pktw-h-auto pktw-whitespace-normal pktw-items-start pktw-justify-start pktw-gap-3 pktw-rounded-md pktw-border pktw-border-border pktw-p-3 pktw-text-left hover:pktw-bg-accent/60"
			onClick={() => action.run()}
		>
			<Icon className="pktw-mt-0.5 pktw-h-4 pktw-w-4 pktw-flex-shrink-0 pktw-text-muted-foreground" />
			<span className="pktw-flex pktw-min-w-0 pktw-flex-col pktw-gap-1">
				<span className="pktw-text-sm pktw-font-medium pktw-text-foreground">{action.label}</span>
				<span className="pktw-text-xs pktw-leading-snug pktw-text-muted-foreground">{action.description}</span>
			</span>
		</Button>
	);
}
