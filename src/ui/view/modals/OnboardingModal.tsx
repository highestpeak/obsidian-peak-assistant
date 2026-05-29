import React, { useState, useCallback } from 'react';
import { Modal } from 'obsidian';
import { ReactRenderer } from '@/ui/react/ReactRenderer';
import { createReactElementWithServices } from '@/ui/react/ReactElementFactory';
import { AppContext } from '@/app/context/AppContext';
import { ProfileRegistry } from '@/core/profiles/ProfileRegistry';
import { NativeModuleManager } from '@/core/storage/sqlite/NativeModuleManager';
import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';
import { Button } from '@/ui/component/shared-ui/button';
import { Check, Loader2, X, ChevronRight, ChevronLeft, Plus } from 'lucide-react';
import { cn } from '@/ui/react/lib/utils';
import { IndexConfigStep } from './onboarding/IndexConfigStep';
import { IndexProgressDisplay } from './onboarding/IndexProgressDisplay';
import { IndexErrorDialog } from './onboarding/IndexErrorDialog';
import { AddProviderForm, SavedProfileRow } from './onboarding/ProviderForm';
import { IndexInitializer } from '@/service/search/index/indexInitializer';
import { IndexService } from '@/service/search/index/indexService';
import type { IndexLevel } from '@/service/search/index/types';
import type { IndexErrorAction } from '@/service/search/index/indexInitializer';
import { hasUsableVaultIndex } from './onboarding/indexingStartup';

// ─── Obsidian Modal wrapper ────────────────────────────────────────────

export class OnboardingModal extends Modal {
	private reactRenderer: ReactRenderer | null = null;

	constructor(private readonly appContext: AppContext) {
		super(appContext.app);
	}

	onOpen(): void {
		const { contentEl, modalEl } = this;
		contentEl.empty();
		contentEl.addClass('peak-onboarding-modal');
		contentEl.addClass('pktw-root');
		contentEl.style.padding = '0';

		modalEl.style.width = '520px';
		modalEl.style.maxWidth = '90vw';
		modalEl.style.padding = '0';

		this.reactRenderer = new ReactRenderer(this.containerEl);
		this.reactRenderer.render(
			createReactElementWithServices(
				OnboardingWizard,
				{ onClose: () => this.close() },
				this.appContext,
			),
		);
	}

	onClose(): void {
		const r = this.reactRenderer;
		this.reactRenderer = null;
		if (r) {
			setTimeout(() => {
				r.unmount();
				this.contentEl.empty();
			}, 0);
		} else {
			this.contentEl.empty();
		}
	}
}

// ─── Step indicator ────────────────────────────────────────────────────

function StepIndicator({ current, total }: { current: number; total: number }) {
	return (
		<div className="pktw-flex pktw-items-center pktw-gap-2 pktw-justify-center pktw-py-3">
			{Array.from({ length: total }, (_, i) => (
				<div
					key={i}
					className={cn(
						'pktw-h-1.5 pktw-rounded-full pktw-transition-all pktw-duration-300',
						i === current ? 'pktw-w-8 pktw-bg-[--interactive-accent]' : 'pktw-w-4 pktw-bg-[--background-modifier-border]',
					)}
				/>
			))}
		</div>
	);
}

// ─── Step 1: Welcome ───────────────────────────────────────────────────

function WelcomeStep({ onNext }: { onNext: () => void }) {
	return (
		<div className="pktw-flex pktw-flex-col pktw-items-center pktw-gap-6 pktw-py-6 pktw-px-8">
			<div className="pktw-text-4xl">&#9968;</div>
			<div className="pktw-text-center">
				<span className="pktw-block pktw-text-lg pktw-font-semibold pktw-text-[--text-normal] pktw-mb-2">
					Welcome to Peak Assistant
				</span>
				<span className="pktw-block pktw-text-sm pktw-text-[--text-muted] pktw-leading-relaxed">
					AI-powered knowledge assistant for your Obsidian vault.
					Let's set up the essentials in a few steps.
				</span>
			</div>
			<Button onClick={onNext} className="pktw-gap-2">
				Get Started <ChevronRight size={16} />
			</Button>
		</div>
	);
}

// ─── Step 2: AI Provider ──────────────────────────────────────────────

function ProviderStep({
	onNext,
	onBack,
}: {
	onNext: () => void;
	onBack: () => void;
}) {
	const [savedProfiles, setSavedProfiles] = useState(() => ProfileRegistry.getInstance().getAllProfiles());
	const [showForm, setShowForm] = useState(savedProfiles.length === 0);

	const refresh = useCallback(() => {
		setSavedProfiles(ProfileRegistry.getInstance().getAllProfiles());
	}, []);

	const handleDelete = useCallback((id: string) => {
		ProfileRegistry.getInstance().deleteProfile(id);
		refresh();
	}, [refresh]);

	const handleAdded = useCallback(() => {
		refresh();
		setShowForm(false);
	}, [refresh]);

	return (
		<div className="pktw-flex pktw-flex-col pktw-gap-4 pktw-py-4 pktw-px-8">
			<span className="pktw-text-base pktw-font-semibold pktw-text-[--text-normal]">
				Configure AI Providers
			</span>

			{/* Saved profiles list */}
			{savedProfiles.length > 0 && (
				<div className="pktw-flex pktw-flex-col pktw-gap-1.5">
					{savedProfiles.map((p) => (
						<SavedProfileRow key={p.id} profile={p} onDelete={() => handleDelete(p.id)} onChange={refresh} />
					))}
				</div>
			)}

			{/* Add form or add button */}
			{showForm ? (
				<AddProviderForm onAdded={handleAdded} />
			) : (
				<Button variant="ghost" size="sm" onClick={() => setShowForm(true)} className="pktw-gap-1.5 pktw-self-start">
					<Plus size={14} /> Add Provider
				</Button>
			)}

			{/* Actions */}
			<div className="pktw-flex pktw-justify-between pktw-pt-1">
				<Button variant="ghost" size="sm" onClick={onBack} className="pktw-gap-1">
					<ChevronLeft size={14} /> Back
				</Button>
				<Button size="sm" onClick={onNext} className="pktw-gap-1">
					{savedProfiles.length > 0 ? 'Continue' : 'Skip'} <ChevronRight size={14} />
				</Button>
			</div>
		</div>
	);
}

// ─── Step 3: System Check ─────────────────────────────────────────────

type SystemStatus = 'checking' | 'downloading' | 'ready' | 'failed';

function SystemCheckStep({
	onDone,
	onBack,
	indexLevel,
}: {
	onDone: () => void;
	onBack: () => void;
	indexLevel: IndexLevel;
}) {
	const [sqliteStatus, setSqliteStatus] = useState<SystemStatus>('checking');
	const [errorMsg, setErrorMsg] = useState('');
	const [indexStatusLabel, setIndexStatusLabel] = useState('');
	const [isIndexing, setIsIndexing] = useState(false);
	const [indexProgress, setIndexProgress] = useState({ step: 0, total: 0, label: '', processed: 0, totalFiles: 0, complete: false });
	const [indexError, setIndexError] = useState<{ step: string; failedCount: number; errorMessage: string } | null>(null);
	const [errorResolver, setErrorResolver] = useState<((action: IndexErrorAction) => void) | null>(null);

	const triggerInitialIndexing = useCallback(async () => {
		if (!indexLevel) return;
		setIsIndexing(true);
		setIndexStatusLabel('');
		setIndexProgress({
			step: 1,
			total: indexLevel === 'fast' ? 2 : 4,
			label: 'Preparing vault index',
			processed: 0,
			totalFiles: 0,
			complete: false,
		});
		try {
			const appCtx = AppContext.getInstance();
			const initializer = new IndexInitializer(
				appCtx.app,
				appCtx.settings.search,
				appCtx.settings.dataStorageFolder,
			);
			const errorHandler = async (err: { step: string; failedCount: number; error: Error }) => {
				return new Promise<IndexErrorAction>((resolve) => {
					setIndexError({ step: err.step, failedCount: err.failedCount, errorMessage: err.error.message });
					setErrorResolver(() => (action: IndexErrorAction) => {
						setIndexError(null);
						setErrorResolver(null);
						resolve(action);
					});
				});
			};
			await initializer.performStagedFullIndexing(false, indexLevel, errorHandler);
		} catch (error) {
			console.error('[Onboarding] Indexing failed:', error);
		}
		setIsIndexing(false);
		setIndexProgress(prev => ({ ...prev, complete: true }));
	}, [indexLevel]);

	const ensureIndexReady = useCallback(async () => {
		try {
			const status = await IndexService.getInstance().getIndexStatus();
			if (hasUsableVaultIndex(status)) {
				const count = status.indexedDocs ?? 0;
				setIndexStatusLabel(count > 0 ? `Search index ready (${count} documents)` : 'Search index ready');
				setIsIndexing(false);
				return;
			}
		} catch (e) {
			console.warn('[Onboarding] Failed to read index status:', e);
		}
		await triggerInitialIndexing();
	}, [triggerInitialIndexing]);

	const runCheck = useCallback(async () => {
		setSqliteStatus('checking');
		setErrorMsg('');

		// Check if already initialized
		if (sqliteStoreManager.isInitialized()) {
			setSqliteStatus('ready');
			void ensureIndexReady();
			return;
		}

		// Try to ensure native module is compatible (may trigger download)
		setSqliteStatus('downloading');
		try {
			await NativeModuleManager.getInstance().ensureCompatible();
		} catch (e) {
			// Non-fatal — ensureCompatible swallows most errors, but just in case
			console.warn('[Onboarding] ensureCompatible error:', e);
		}

		// Try to initialize SQLite
		try {
			const plugin = AppContext.getInstance().plugin!;
			await (plugin as any).initSqlite();
			setSqliteStatus('ready');
			void ensureIndexReady();
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			setErrorMsg(msg);
			setSqliteStatus('failed');
		}
	}, [ensureIndexReady]);

	// Auto-run on mount
	React.useEffect(() => { void runCheck(); }, [runCheck]);

	return (
		<div className="pktw-flex pktw-flex-col pktw-gap-5 pktw-py-4 pktw-px-8">
			<span className="pktw-text-base pktw-font-semibold pktw-text-[--text-normal]">
				System Components
			</span>

			<div className="pktw-flex pktw-items-center pktw-gap-3 pktw-p-4 pktw-rounded-lg pktw-border pktw-border-[--background-modifier-border]">
				{sqliteStatus === 'checking' && <Loader2 size={18} className="pktw-animate-spin pktw-text-[--text-muted]" />}
				{sqliteStatus === 'downloading' && <Loader2 size={18} className="pktw-animate-spin pktw-text-[--interactive-accent]" />}
				{sqliteStatus === 'ready' && <Check size={18} className="pktw-text-green-600" />}
				{sqliteStatus === 'failed' && <X size={18} className="pktw-text-red-500" />}
				<div className="pktw-flex-1">
					<span className="pktw-block pktw-text-sm pktw-font-medium pktw-text-[--text-normal]">SQLite Engine</span>
					<span className="pktw-block pktw-text-xs pktw-text-[--text-muted]">
						{sqliteStatus === 'checking' && 'Checking availability...'}
						{sqliteStatus === 'downloading' && 'Downloading native component...'}
						{sqliteStatus === 'ready' && 'Ready'}
						{sqliteStatus === 'failed' && (errorMsg || 'Failed to initialize')}
					</span>
				</div>
				{sqliteStatus === 'failed' && (
					<Button variant="ghost" size="sm" onClick={runCheck}>
						Retry
					</Button>
				)}
			</div>

			{/* Indexing progress */}
			{!isIndexing && !indexError && indexStatusLabel && (
				<div className="pktw-flex pktw-items-center pktw-gap-3 pktw-p-4 pktw-rounded-lg pktw-border pktw-border-[--background-modifier-border]">
					<Check size={18} className="pktw-text-green-600 pktw-shrink-0" />
					<div className="pktw-flex-1">
						<span className="pktw-block pktw-text-sm pktw-font-medium pktw-text-[--text-normal]">Vault Index</span>
						<span className="pktw-block pktw-text-xs pktw-text-[--text-muted]">{indexStatusLabel}</span>
					</div>
				</div>
			)}
			{isIndexing && !indexError && (
				<IndexProgressDisplay
					currentStep={indexProgress.step}
					totalSteps={indexProgress.total}
					stepLabel={indexProgress.label}
					processedFiles={indexProgress.processed}
					totalFiles={indexProgress.totalFiles}
					isComplete={indexProgress.complete}
				/>
			)}

			{/* Indexing error dialog */}
			{indexError && errorResolver && (
				<IndexErrorDialog
					step={indexError.step}
					failedCount={indexError.failedCount}
					errorMessage={indexError.errorMessage}
					onAction={errorResolver}
				/>
			)}

			<div className="pktw-flex pktw-justify-between pktw-pt-2">
				<Button variant="ghost" size="sm" onClick={onBack} className="pktw-gap-1" disabled={isIndexing}>
					<ChevronLeft size={14} /> Back
				</Button>
				<Button size="sm" onClick={onDone} className="pktw-gap-1" disabled={isIndexing}>
					{sqliteStatus === 'ready' ? 'Done' : 'Close'} <Check size={14} />
				</Button>
			</div>
		</div>
	);
}

// ─── Wizard root ──────────────────────────────────────────────────────

const TOTAL_STEPS = 4;

function OnboardingWizard({ onClose }: { onClose: () => void }) {
	const [step, setStep] = useState(0);
	const [indexLevel, setIndexLevel] = useState<IndexLevel>('fast');

	const handleIndexConfigNext = (level: IndexLevel, embConfig?: { endpoint: string; model: string; apiKey: string }) => {
		setIndexLevel(level);
		if (embConfig) {
			// Save embedding config to active profile
			const registry = ProfileRegistry.getInstance();
			const profile = registry.getActiveAgentProfile();
			if (profile) {
				registry.updateProfile(profile.id, {
					embeddingEndpoint: embConfig.endpoint,
					embeddingModel: embConfig.model,
					embeddingApiKey: embConfig.apiKey || null,
				});
			}
		}
		// Save index level to settings
		const appCtx = AppContext.getInstance();
		if (appCtx.settings) {
			appCtx.settings.search.indexLevel = level;
			appCtx.plugin.saveSettings();
		}
		setStep(3);
	};

	const handleIndexSkip = () => {
		const appCtx = AppContext.getInstance();
		if (appCtx.settings) {
			appCtx.settings.search.indexLevel = 'fast';
			appCtx.plugin.saveSettings();
		}
		setStep(3);
	};

	return (
		<div className="pktw-flex pktw-flex-col">
			<StepIndicator current={step} total={TOTAL_STEPS} />
			{step === 0 && <WelcomeStep onNext={() => setStep(1)} />}
			{step === 1 && <ProviderStep onNext={() => setStep(2)} onBack={() => setStep(0)} />}
			{step === 2 && (
				<IndexConfigStep
					onNext={handleIndexConfigNext}
					onBack={() => setStep(1)}
					onSkip={handleIndexSkip}
				/>
			)}
			{step === 3 && <SystemCheckStep onDone={onClose} onBack={() => setStep(2)} indexLevel={indexLevel} />}
		</div>
	);
}
