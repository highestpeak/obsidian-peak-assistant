import { Modal } from 'obsidian';
import React, { useMemo, useState } from 'react';
import {
	Activity,
	BarChart3,
	Bot,
	Brain,
	Database,
	FileSearch,
	FolderKanban,
	Gauge,
	LayoutDashboard,
	Layers,
	MessageCircle,
	PanelRightOpen,
	RefreshCw,
	Search,
	Settings,
	ShieldAlert,
	Sparkles,
	Tags,
	TerminalSquare,
	WandSparkles,
	Wrench,
	Zap,
} from 'lucide-react';
import { ReactRenderer } from '@/ui/react/ReactRenderer';
import { createReactElementWithServices } from '@/ui/react/ReactElementFactory';
import { AppContext } from '@/app/context/AppContext';
import { Button } from '@/ui/component/shared-ui/button';
import { Input } from '@/ui/component/shared-ui/input';
import { cn } from '@/ui/react/lib/utils';
import {
	analyzeVaultIntuition,
	buildUserProfileAction,
	cancelIndexing,
	cleanupUselessData,
	clearUserProfileBuildRecord,
	compareSearchResults,
	createChatConversation,
	createChatProject,
	deleteIndexData,
	openAssistant,
	openBatchTagSuggestions,
	openDocumentCopilotPanel,
	openGapAnalysis,
	openKnowledgeCenter,
	openManageSystemPanel,
	openPromptTemplates,
	openQuickSearch,
	openRelatedNotes,
	openHarnessSetupWizard,
	openSettingsModal,
	openSkillPicker,
	openUsageDashboard,
	openVaultIntelligencePanel,
	openVaultXRay,
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

type ActionTone = 'normal' | 'advanced' | 'danger';

interface CommandCenterAction {
	id: string;
	label: string;
	description: string;
	icon: React.ElementType;
	tone?: ActionTone;
	run: () => void | Promise<void>;
}

interface CommandCenterSection {
	id: string;
	label: string;
	actions: CommandCenterAction[];
}

function baseSections(): CommandCenterSection[] {
	return [
		{
			id: 'assistant',
			label: 'Assistant',
			actions: [
				{ id: 'open-assistant', label: 'Open Assistant', description: 'Open the chat workspace.', icon: MessageCircle, run: openAssistant },
				{ id: 'new-chat', label: 'New Chat', description: 'Start a fresh conversation.', icon: Bot, run: createChatConversation },
				{ id: 'new-project', label: 'New Project', description: 'Create a chat project.', icon: FolderKanban, run: createChatProject },
				{ id: 'run-skill', label: 'Run Skill', description: 'Pick and run a saved skill.', icon: WandSparkles, run: openSkillPicker },
			],
		},
		{
			id: 'search',
			label: 'Search',
			actions: [
				{ id: 'quick-search', label: 'Quick Search', description: 'Search notes and run AI analysis.', icon: Search, run: openQuickSearch },
				{ id: 'update-index', label: 'Update Index', description: 'Run the normal fast index update.', icon: Database, run: runSearchFastIndex },
				{ id: 'full-index', label: 'Full Index Pipeline', description: 'Run the configured full indexing pipeline.', icon: RefreshCw, tone: 'advanced', run: runFullIndexPipeline },
			],
		},
		{
			id: 'copilot',
			label: 'Copilot & Knowledge',
			actions: [
				{ id: 'document-copilot', label: 'Document', description: 'Run Copilot Auto or search document capabilities.', icon: Sparkles, run: openDocumentCopilotPanel },
				{ id: 'vault-intelligence', label: 'Vault', description: 'Analyze, synthesize, or maintain vault knowledge.', icon: Brain, run: openVaultIntelligencePanel },
				{ id: 'manage-system', label: 'Setting', description: 'Diagnose index, models, skills, prompts, and system health.', icon: Settings, run: openManageSystemPanel },
			],
		},
		{
			id: 'knowledge-tools',
			label: 'More Knowledge Tools',
			actions: [
				{ id: 'batch-tags', label: 'Batch Tag Suggestions', description: 'Suggest tags across a selected folder.', icon: Tags, run: openBatchTagSuggestions },
				{ id: 'knowledge-center', label: 'Knowledge Center', description: 'Open the knowledge-base operations panel.', icon: Brain, run: openKnowledgeCenter },
				{ id: 'related-notes', label: 'Related Notes', description: 'Open ambient related-note suggestions.', icon: Zap, run: openRelatedNotes },
				{ id: 'vault-xray', label: 'Vault X-Ray', description: 'Review knowledge-base health signals.', icon: Activity, run: openVaultXRay },
				{ id: 'gap-analysis', label: 'Gap Analysis', description: 'Inspect structural holes and bridge notes.', icon: Layers, run: openGapAnalysis },
			],
		},
		{
			id: 'setup',
			label: 'Usage & Setup',
			actions: [
				{ id: 'usage-dashboard', label: 'Usage Dashboard', description: 'Inspect token usage and cost trends.', icon: BarChart3, run: openUsageDashboard },
				{ id: 'prompt-templates', label: 'Prompt Templates', description: 'Edit reusable prompt templates.', icon: FileSearch, run: openPromptTemplates },
				{ id: 'settings', label: 'Settings', description: 'Open Peak Assistant settings.', icon: Settings, run: openSettingsModal },
				{ id: 'setup-wizard', label: 'Setup Wizard', description: 'Run onboarding and native-module setup.', icon: LayoutDashboard, run: openHarnessSetupWizard },
			],
		},
	];
}

function advancedSection(): CommandCenterSection {
	return {
		id: 'advanced',
		label: 'Advanced Maintenance',
		actions: [
			{ id: 'db-health', label: 'Verify Database Health', description: 'Run SQLite integrity checks.', icon: Gauge, tone: 'advanced', run: verifyDatabaseHealthAction },
			{ id: 'cleanup', label: 'Cleanup Useless Data', description: 'Remove orphaned index and chat records.', icon: Wrench, tone: 'advanced', run: cleanupUselessData },
			{ id: 'cancel-indexing', label: 'Cancel Indexing', description: 'Stop the current indexing operation.', icon: TerminalSquare, tone: 'advanced', run: cancelIndexing },
			{ id: 'vector-pending', label: 'Build Pending Vectors', description: 'Run vector enrichment for pending documents.', icon: Database, tone: 'advanced', run: runVectorEnrichmentPending },
			{ id: 'llm-pending', label: 'Run Pending LLM Enrichment', description: 'Run pending tags and summaries enrichment.', icon: Sparkles, tone: 'advanced', run: runLlmEnrichmentPending },
			{ id: 'global-maintenance', label: 'Global Maintenance', description: 'Rebuild graph aggregates and maintenance data.', icon: RefreshCw, tone: 'advanced', run: runGlobalMaintenance },
			{ id: 'hub-refresh', label: 'Refresh Hub Summaries', description: 'Regenerate queued hub summaries.', icon: PanelRightOpen, tone: 'advanced', run: refreshHubSummaries },
			{ id: 'gap-recompute', label: 'Recompute Gap Analysis', description: 'Force a structural-hole recompute.', icon: Layers, tone: 'advanced', run: recomputeGapAnalysis },
			{ id: 'related-refresh', label: 'Refresh Related Notes', description: 'Trigger ambient related-note refresh.', icon: Zap, tone: 'advanced', run: refreshRelatedNotes },
			{ id: 'vault-intuition', label: 'Analyze Vault Intuition', description: 'Regenerate the vault intuition map.', icon: Brain, tone: 'advanced', run: analyzeVaultIntuition },
			{ id: 'build-profile', label: 'Build User Profile', description: 'Scan vault content for user profile context.', icon: Bot, tone: 'advanced', run: buildUserProfileAction },
			{ id: 'clear-profile', label: 'Clear Profile Build Record', description: 'Force the next profile build to rescan files.', icon: ShieldAlert, tone: 'danger', run: clearUserProfileBuildRecord },
			{ id: 'ppr-compare', label: 'Compare PPR Search', description: 'Evaluate PPR results against baseline search.', icon: FileSearch, tone: 'advanced', run: compareSearchResults },
			{ id: 'delete-index', label: 'Delete Index Data', description: 'Delete all indexed documents after confirmation.', icon: ShieldAlert, tone: 'danger', run: deleteIndexData },
		],
	};
}

function CommandCenterContent({ onClose }: { onClose: () => void }) {
	const [query, setQuery] = useState('');
	const [showAdvanced, setShowAdvanced] = useState(false);
	const sections = useMemo(() => {
		return showAdvanced ? [...baseSections(), advancedSection()] : baseSections();
	}, [showAdvanced]);

	const normalizedQuery = query.trim().toLowerCase();
	const filteredSections = sections
		.map(section => ({
			...section,
			actions: section.actions.filter(action => {
				if (!normalizedQuery) return true;
				return `${action.label} ${action.description} ${section.label}`.toLowerCase().includes(normalizedQuery);
			}),
		}))
		.filter(section => section.actions.length > 0);

	const runAction = async (action: CommandCenterAction) => {
		onClose();
		await action.run();
	};

	return (
		<div className="pktw-flex pktw-flex-col pktw-h-full pktw-bg-background">
			<div className="pktw-flex pktw-items-center pktw-justify-between pktw-gap-3 pktw-px-5 pktw-py-4 pktw-border-b pktw-border-border">
				<div className="pktw-flex pktw-flex-col pktw-gap-0.5">
					<span className="pktw-text-sm pktw-font-semibold">Peak Command Center</span>
					<span className="pktw-text-xs pktw-text-muted-foreground">Fast access to assistant, copilot, search, knowledge, and maintenance tools.</span>
				</div>
				<Button variant="outline" size="sm" onClick={() => setShowAdvanced(v => !v)}>
					{showAdvanced ? 'Hide Advanced' : 'Show Advanced'}
				</Button>
			</div>

			<div className="pktw-px-5 pktw-py-3 pktw-border-b pktw-border-border">
				<Input
					value={query}
					onChange={(e) => setQuery(e.target.value)}
					placeholder="Search Peak commands..."
					autoFocus
				/>
			</div>

			<div className="pktw-flex-1 pktw-overflow-y-auto pktw-px-5 pktw-py-4 pktw-space-y-5">
				{filteredSections.map(section => (
					<CommandSection key={section.id} section={section} onRun={runAction} />
				))}
				{filteredSections.length === 0 && (
					<span className="pktw-block pktw-text-sm pktw-text-muted-foreground pktw-text-center pktw-py-10">
						No matching Peak command.
					</span>
				)}
			</div>
		</div>
	);
}

function CommandSection({
	section,
	onRun,
}: {
	section: CommandCenterSection;
	onRun: (action: CommandCenterAction) => void | Promise<void>;
}) {
	return (
		<div className="pktw-flex pktw-flex-col pktw-gap-2">
			<span className="pktw-text-[11px] pktw-font-semibold pktw-uppercase pktw-tracking-wider pktw-text-muted-foreground">
				{section.label}
			</span>
			<div className="pktw-grid pktw-grid-cols-2 pktw-gap-2">
				{section.actions.map(action => (
					<CommandActionButton key={action.id} action={action} onRun={onRun} />
				))}
			</div>
		</div>
	);
}

function CommandActionButton({
	action,
	onRun,
}: {
	action: CommandCenterAction;
	onRun: (action: CommandCenterAction) => void | Promise<void>;
}) {
	const Icon = action.icon;
	return (
		<Button
			variant="ghost"
			className={cn(
				'pktw-h-auto pktw-whitespace-normal pktw-justify-start pktw-items-start pktw-gap-3 pktw-p-3 pktw-border pktw-border-border pktw-rounded-md pktw-text-left hover:pktw-bg-accent/60',
				action.tone === 'danger' && 'pktw-border-destructive/40 hover:pktw-bg-destructive/10',
			)}
			onClick={() => onRun(action)}
		>
			<Icon className={cn(
				'pktw-w-4 pktw-h-4 pktw-mt-0.5 pktw-flex-shrink-0 pktw-text-muted-foreground',
				action.tone === 'danger' && 'pktw-text-destructive',
			)} />
			<span className="pktw-flex pktw-flex-col pktw-gap-1 pktw-min-w-0">
				<span className="pktw-flex pktw-items-center pktw-gap-2 pktw-text-sm pktw-font-medium pktw-text-foreground">
					{action.label}
					{action.tone === 'danger' && (
						<span className="pktw-text-[10px] pktw-font-semibold pktw-uppercase pktw-text-destructive">
							Danger
						</span>
					)}
				</span>
				<span className="pktw-text-xs pktw-leading-snug pktw-text-muted-foreground">
					{action.description}
				</span>
			</span>
		</Button>
	);
}

export class CommandCenterModal extends Modal {
	private reactRenderer: ReactRenderer | null = null;

	constructor(private readonly appContext: AppContext) {
		super(appContext.app);
	}

	onOpen(): void {
		this.contentEl.empty();
		this.contentEl.addClass('pktw-root');
		this.contentEl.style.padding = '0';
		this.modalEl.style.width = '760px';
		this.modalEl.style.maxWidth = '92vw';
		this.modalEl.style.height = 'min(760px, calc(100vh - 96px))';
		this.modalEl.style.padding = '0';

		this.reactRenderer = new ReactRenderer(this.containerEl);
		this.reactRenderer.render(
			createReactElementWithServices(
				CommandCenterContent,
				{ onClose: () => this.close() },
				this.appContext,
			),
		);
	}

	onClose(): void {
		const r = this.reactRenderer;
		this.reactRenderer = null;
		if (r) setTimeout(() => r.unmount(), 0);
		this.contentEl.empty();
	}
}
