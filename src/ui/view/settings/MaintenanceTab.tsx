import React, { useState } from 'react';
import {
	Activity,
	Brain,
	Database,
	FileSearch,
	Layers,
	RefreshCw,
	ShieldAlert,
	Sparkles,
	Trash2,
	Wrench,
	Zap,
} from 'lucide-react';
import { Button } from '@/ui/component/shared-ui/button';
import { SectionHeader } from './components/SectionHeader';
import { SettingCard } from './components/SettingCard';
import {
	analyzeVaultIntuition,
	cancelIndexing,
	cleanupUselessData,
	clearUserProfileBuildRecord,
	compareSearchResults,
	deleteIndexData,
	recomputeGapAnalysis,
	refreshHubSummaries,
	refreshRelatedNotes,
	runFullIndexPipeline,
	runGlobalMaintenance,
	runLlmEnrichmentPending,
	runSearchFastIndex,
	runVectorEnrichmentPending,
	verifyDatabaseHealthAction,
} from '@/app/commands/PeakCommandActions';

interface MaintenanceAction {
	id: string;
	label: string;
	description: string;
	icon: React.ElementType;
	danger?: boolean;
	run: () => void | Promise<void>;
}

const INDEX_ACTIONS: MaintenanceAction[] = [
	{ id: 'update-index', label: 'Update Index', description: 'Run the normal fast index update.', icon: Database, run: runSearchFastIndex },
	{ id: 'full-pipeline', label: 'Full Pipeline', description: 'Run the configured full indexing pipeline.', icon: RefreshCw, run: runFullIndexPipeline },
	{ id: 'cancel-indexing', label: 'Cancel Indexing', description: 'Stop the current indexing operation.', icon: ShieldAlert, run: cancelIndexing },
];

const KNOWLEDGE_ACTIONS: MaintenanceAction[] = [
	{ id: 'related-refresh', label: 'Refresh Related Notes', description: 'Trigger ambient related-note refresh.', icon: Zap, run: refreshRelatedNotes },
	{ id: 'hub-refresh', label: 'Refresh Hub Summaries', description: 'Regenerate queued hub summaries.', icon: FileSearch, run: refreshHubSummaries },
	{ id: 'gap-recompute', label: 'Recompute Gap Analysis', description: 'Force structural-hole analysis to run again.', icon: Layers, run: recomputeGapAnalysis },
	{ id: 'vault-intuition', label: 'Analyze Vault Intuition', description: 'Regenerate the high-level vault intuition map.', icon: Brain, run: analyzeVaultIntuition },
];

const ADVANCED_ACTIONS: MaintenanceAction[] = [
	{ id: 'db-health', label: 'Verify Database Health', description: 'Run SQLite integrity checks.', icon: Activity, run: verifyDatabaseHealthAction },
	{ id: 'cleanup', label: 'Cleanup Useless Data', description: 'Remove orphaned index and chat records.', icon: Wrench, run: cleanupUselessData },
	{ id: 'vector-pending', label: 'Build Pending Vectors', description: 'Run vector enrichment for pending documents.', icon: Database, run: runVectorEnrichmentPending },
	{ id: 'llm-pending', label: 'Run Pending LLM Enrichment', description: 'Run pending tags and summaries enrichment.', icon: Sparkles, run: runLlmEnrichmentPending },
	{ id: 'global-maintenance', label: 'Global Maintenance', description: 'Rebuild graph aggregates and maintenance data.', icon: RefreshCw, run: runGlobalMaintenance },
	{ id: 'ppr-compare', label: 'Compare PPR Search', description: 'Evaluate PPR results against baseline search.', icon: FileSearch, run: compareSearchResults },
	{ id: 'clear-profile', label: 'Clear Profile Build Record', description: 'Force the next profile build to rescan files.', icon: ShieldAlert, danger: true, run: clearUserProfileBuildRecord },
	{ id: 'delete-index', label: 'Delete Index Data', description: 'Delete all indexed documents after confirmation.', icon: Trash2, danger: true, run: deleteIndexData },
];

export function MaintenanceTab() {
	return (
		<div className="pktw-flex pktw-flex-col pktw-gap-1.5 pktw-mt-4">
			<MaintenanceSection icon={Database} title="Index" actions={INDEX_ACTIONS} />
			<div className="pktw-border-t pktw-border-border pktw-my-1" />
			<MaintenanceSection icon={Brain} title="Knowledge Graph" actions={KNOWLEDGE_ACTIONS} />
			<div className="pktw-border-t pktw-border-border pktw-my-1" />
			<MaintenanceSection icon={Wrench} title="Advanced" actions={ADVANCED_ACTIONS} />
		</div>
	);
}

function MaintenanceSection({
	icon,
	title,
	actions,
}: {
	icon: React.ElementType;
	title: string;
	actions: MaintenanceAction[];
}) {
	return (
		<>
			<SectionHeader icon={icon} title={title} />
			{actions.map(action => (
				<MaintenanceRow key={action.id} action={action} />
			))}
		</>
	);
}

function MaintenanceRow({ action }: { action: MaintenanceAction }) {
	const [running, setRunning] = useState(false);
	const Icon = action.icon;

	const handleRun = async () => {
		if (running) return;
		setRunning(true);
		try {
			await action.run();
		} finally {
			setRunning(false);
		}
	};

	return (
		<SettingCard label={action.label} description={action.description}>
			<Button
				variant={action.danger ? 'destructive' : 'outline'}
				size="sm"
				disabled={running}
				onClick={handleRun}
			>
				<Icon className="pktw-mr-1.5 pktw-h-3.5 pktw-w-3.5" />
				{running ? 'Running...' : 'Run'}
			</Button>
		</SettingCard>
	);
}
