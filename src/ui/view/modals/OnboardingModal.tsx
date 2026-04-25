import React, { useState, useCallback } from 'react';
import { Modal, Notice, requestUrl } from 'obsidian';
import { ReactRenderer } from '@/ui/react/ReactRenderer';
import { createReactElementWithServices } from '@/ui/react/ReactElementFactory';
import { AppContext } from '@/app/context/AppContext';
import { ProfileRegistry } from '@/core/profiles/ProfileRegistry';
import { createPresetProfile } from '@/core/profiles/presets';
import type { ProfileKind } from '@/core/profiles/types';
import { NativeModuleManager } from '@/core/storage/sqlite/NativeModuleManager';
import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';
import { Button } from '@/ui/component/shared-ui/button';
import { Shield, Globe, Zap, Settings2, Check, Loader2, X, ChevronRight, ChevronLeft, Plus, ExternalLink, Trash2 } from 'lucide-react';
import { cn } from '@/ui/react/lib/utils';

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

// ─── Provider presets ──────────────────────────────────────────────────

const PROVIDER_OPTIONS: {
	kind: ProfileKind;
	label: string;
	desc: string;
	Icon: React.FC<{ className?: string; size?: number }>;
	keyUrl: string | null;
	keyUrlLabel: string;
}[] = [
	{ kind: 'anthropic', label: 'Anthropic', desc: 'Direct API access', Icon: Shield, keyUrl: 'https://console.anthropic.com/settings/keys', keyUrlLabel: 'Get API Key' },
	{ kind: 'openai', label: 'OpenAI', desc: 'GPT models', Icon: Zap, keyUrl: 'https://platform.openai.com/api-keys', keyUrlLabel: 'Get API Key' },
	{ kind: 'google', label: 'Google AI', desc: 'Gemini models', Icon: Globe, keyUrl: 'https://aistudio.google.com/apikey', keyUrlLabel: 'Get API Key' },
	{ kind: 'openrouter', label: 'OpenRouter', desc: 'Multi-provider gateway', Icon: Globe, keyUrl: 'https://openrouter.ai/keys', keyUrlLabel: 'Get API Key' },
	{ kind: 'ollama', label: 'Ollama', desc: 'Local models', Icon: Settings2, keyUrl: 'https://ollama.com/', keyUrlLabel: 'Documentation' },
	{ kind: 'perplexity', label: 'Perplexity', desc: 'Search-augmented AI', Icon: Globe, keyUrl: 'https://www.perplexity.ai/settings/api', keyUrlLabel: 'Get API Key' },
	{ kind: 'litellm', label: 'LiteLLM', desc: 'Self-hosted proxy', Icon: Zap, keyUrl: 'https://docs.litellm.ai/docs/', keyUrlLabel: 'Documentation' },
	{ kind: 'custom', label: 'Custom', desc: 'OpenAI-compatible endpoint', Icon: Settings2, keyUrl: null, keyUrlLabel: '' },
];

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

/** Test connectivity for a given provider kind + API key. */
async function testProviderConnection(kind: ProfileKind, apiKey: string): Promise<boolean> {
	try {
		const profile = createPresetProfile(kind, { apiKey });
		const baseUrl = profile.baseUrl;
		const headers: Record<string, string> = { 'Content-Type': 'application/json' };

		if (kind === 'anthropic') {
			headers['x-api-key'] = apiKey;
			headers['anthropic-version'] = '2023-06-01';
			const res = await requestUrl({
				url: 'https://api.anthropic.com/v1/messages',
				method: 'POST',
				headers,
				body: JSON.stringify({
					model: 'claude-haiku-4-5-20251001',
					max_tokens: 1,
					messages: [{ role: 'user', content: 'hi' }],
				}),
				throw: false,
			});
			return res.status < 500;
		} else {
			headers['Authorization'] = `Bearer ${apiKey}`;
			const res = await requestUrl({
				url: `${baseUrl}/v1/models`,
				method: 'GET',
				headers,
				throw: false,
			});
			return res.status < 500;
		}
	} catch {
		return false;
	}
}

/** Inline form for adding a single provider profile. */
function AddProviderForm({ onAdded }: { onAdded: () => void }) {
	const [selectedKind, setSelectedKind] = useState<ProfileKind>('anthropic');
	const [apiKey, setApiKey] = useState('');
	const [testing, setTesting] = useState(false);
	const [testResult, setTestResult] = useState<'success' | 'fail' | null>(null);

	const selectedOption = PROVIDER_OPTIONS.find((p) => p.kind === selectedKind)!;

	const handleTest = useCallback(async () => {
		if (!apiKey.trim()) return;
		setTesting(true);
		setTestResult(null);
		const ok = await testProviderConnection(selectedKind, apiKey);
		setTestResult(ok ? 'success' : 'fail');
		setTesting(false);
	}, [apiKey, selectedKind]);

	const handleSave = useCallback(() => {
		if (!apiKey.trim()) return;
		const registry = ProfileRegistry.getInstance();
		const profile = createPresetProfile(selectedKind, { apiKey });
		registry.addProfile(profile);
		// Set as active agent profile if it's the first one
		if (!registry.getActiveAgentProfile()) {
			registry.setActiveAgentProfile(profile.id);
		}
		new Notice(`Profile "${profile.name}" added`);
		setApiKey('');
		setTestResult(null);
		onAdded();
	}, [apiKey, selectedKind, onAdded]);

	return (
		<div className="pktw-flex pktw-flex-col pktw-gap-3 pktw-p-3 pktw-rounded-lg pktw-border pktw-border-[--background-modifier-border] pktw-bg-[--background-primary-alt]">
			{/* Provider kind selector */}
			<div className="pktw-grid pktw-grid-cols-2 pktw-gap-1.5">
				{PROVIDER_OPTIONS.map(({ kind, label, Icon }) => (
					<div
						key={kind}
						onClick={() => { setSelectedKind(kind); setTestResult(null); }}
						className={cn(
							'pktw-flex pktw-items-center pktw-gap-2 pktw-px-3 pktw-py-2 pktw-rounded-md pktw-cursor-pointer pktw-transition-colors pktw-text-sm',
							selectedKind === kind
								? 'pktw-bg-[--interactive-accent] pktw-text-[--text-on-accent]'
								: 'pktw-text-[--text-normal] hover:pktw-bg-[--background-modifier-hover]',
						)}
					>
						<Icon size={14} className="pktw-shrink-0" />
						{label}
					</div>
				))}
			</div>

			{/* Platform link */}
			{selectedOption.keyUrl && (
				<a
					href={selectedOption.keyUrl}
					className="pktw-flex pktw-items-center pktw-gap-1.5 pktw-text-xs pktw-text-[--text-accent] hover:pktw-underline pktw-w-fit"
				>
					<ExternalLink size={11} />
					{selectedOption.keyUrlLabel} — {selectedOption.label}
				</a>
			)}

			{/* API Key input */}
			<div className="pktw-flex pktw-gap-2">
				<input
					type="password"
					placeholder="sk-..."
					value={apiKey}
					onChange={(e) => { setApiKey(e.target.value); setTestResult(null); }}
					className="pktw-flex-1 pktw-px-3 pktw-py-1.5 pktw-text-sm pktw-border pktw-border-[--background-modifier-border] pktw-rounded-md pktw-bg-[--background-primary] pktw-text-[--text-normal] focus:pktw-outline-none focus:pktw-ring-1 focus:pktw-ring-[--interactive-accent]"
				/>
				<Button variant="ghost" size="sm" onClick={handleTest} disabled={!apiKey.trim() || testing} className="pktw-gap-1.5">
					{testing ? <Loader2 size={14} className="pktw-animate-spin" /> : null}
					Test
				</Button>
				<Button size="sm" onClick={handleSave} disabled={!apiKey.trim()}>
					Add
				</Button>
			</div>

			{/* Test result */}
			{testResult === 'success' && (
				<span className="pktw-text-xs pktw-text-green-600 pktw-flex pktw-items-center pktw-gap-1">
					<Check size={12} /> Connection successful
				</span>
			)}
			{testResult === 'fail' && (
				<span className="pktw-text-xs pktw-text-red-500 pktw-flex pktw-items-center pktw-gap-1">
					<X size={12} /> Connection failed — check key and try again
				</span>
			)}
		</div>
	);
}

/** Expandable row for an already-saved profile — click to edit. */
function SavedProfileRow({ profile, onDelete, onChange }: {
	profile: { id: string; name: string; kind: ProfileKind; apiKey: string | null; baseUrl: string };
	onDelete: () => void;
	onChange: () => void;
}) {
	const [expanded, setExpanded] = useState(false);
	const [apiKey, setApiKey] = useState(profile.apiKey ?? '');
	const [testing, setTesting] = useState(false);
	const [testResult, setTestResult] = useState<'success' | 'fail' | null>(null);

	const option = PROVIDER_OPTIONS.find((p) => p.kind === profile.kind);
	const Icon = option?.Icon ?? Settings2;
	const isActive = ProfileRegistry.getInstance().getActiveAgentProfile()?.id === profile.id;

	const handleSave = useCallback(() => {
		ProfileRegistry.getInstance().updateProfile(profile.id, { apiKey: apiKey || null });
		new Notice('Profile updated');
		setExpanded(false);
		onChange();
	}, [apiKey, profile.id, onChange]);

	const handleTest = useCallback(async () => {
		if (!apiKey.trim()) return;
		setTesting(true);
		setTestResult(null);
		const ok = await testProviderConnection(profile.kind, apiKey);
		setTestResult(ok ? 'success' : 'fail');
		setTesting(false);
	}, [apiKey, profile.kind]);

	const handleSetActive = useCallback(() => {
		ProfileRegistry.getInstance().setActiveAgentProfile(profile.id);
		onChange();
	}, [profile.id, onChange]);

	return (
		<div className="pktw-rounded-md pktw-border pktw-border-[--background-modifier-border] pktw-overflow-hidden">
			{/* Header row — click to expand */}
			<div
				onClick={() => setExpanded(!expanded)}
				className="pktw-flex pktw-items-center pktw-gap-3 pktw-px-3 pktw-py-2 pktw-cursor-pointer hover:pktw-bg-[--background-modifier-hover] pktw-transition-colors"
			>
				<Icon size={14} className="pktw-text-[--text-muted] pktw-shrink-0" />
				<span className="pktw-flex-1 pktw-text-sm pktw-text-[--text-normal] pktw-truncate">{profile.name}</span>
				{isActive && (
					<span className="pktw-text-[10px] pktw-px-1.5 pktw-py-0.5 pktw-rounded pktw-bg-green-100 pktw-text-green-700">active</span>
				)}
				<ChevronRight size={13} className={cn('pktw-text-[--text-muted] pktw-transition-transform', expanded && 'pktw-rotate-90')} />
			</div>

			{/* Expanded edit form */}
			{expanded && (
				<div className="pktw-flex pktw-flex-col pktw-gap-2 pktw-px-3 pktw-pb-3 pktw-pt-1 pktw-border-t pktw-border-[--background-modifier-border]">
					{option?.keyUrl && (
						<a href={option.keyUrl} className="pktw-flex pktw-items-center pktw-gap-1.5 pktw-text-xs pktw-text-[--text-accent] hover:pktw-underline pktw-w-fit">
							<ExternalLink size={11} />
							{option.keyUrlLabel}
						</a>
					)}
					<div className="pktw-flex pktw-gap-2">
						<input
							type="password"
							placeholder="sk-..."
							value={apiKey}
							onChange={(e) => { setApiKey(e.target.value); setTestResult(null); }}
							className="pktw-flex-1 pktw-px-2.5 pktw-py-1.5 pktw-text-sm pktw-border pktw-border-[--background-modifier-border] pktw-rounded-md pktw-bg-[--background-primary] pktw-text-[--text-normal] focus:pktw-outline-none focus:pktw-ring-1 focus:pktw-ring-[--interactive-accent]"
						/>
						<Button variant="ghost" size="sm" onClick={handleTest} disabled={!apiKey.trim() || testing} className="pktw-gap-1">
							{testing ? <Loader2 size={12} className="pktw-animate-spin" /> : null}
							Test
						</Button>
						<Button size="sm" onClick={handleSave} disabled={!apiKey.trim()}>Save</Button>
					</div>
					{testResult === 'success' && (
						<span className="pktw-text-xs pktw-text-green-600 pktw-flex pktw-items-center pktw-gap-1"><Check size={12} /> OK</span>
					)}
					{testResult === 'fail' && (
						<span className="pktw-text-xs pktw-text-red-500 pktw-flex pktw-items-center pktw-gap-1"><X size={12} /> Failed</span>
					)}
					<div className="pktw-flex pktw-gap-2 pktw-pt-1">
						{!isActive && (
							<Button variant="ghost" size="sm" onClick={handleSetActive} className="pktw-text-xs">Set Active</Button>
						)}
						<Button variant="ghost" size="sm" onClick={onDelete} className="pktw-text-xs pktw-text-red-500 hover:pktw-text-red-600 pktw-gap-1">
							<Trash2 size={12} /> Delete
						</Button>
					</div>
				</div>
			)}
		</div>
	);
}

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
}: {
	onDone: () => void;
	onBack: () => void;
}) {
	const [sqliteStatus, setSqliteStatus] = useState<SystemStatus>('checking');
	const [errorMsg, setErrorMsg] = useState('');

	const runCheck = useCallback(async () => {
		setSqliteStatus('checking');
		setErrorMsg('');

		// Check if already initialized
		if (sqliteStoreManager.isInitialized()) {
			setSqliteStatus('ready');
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
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			setErrorMsg(msg);
			setSqliteStatus('failed');
		}
	}, []);

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

			<div className="pktw-flex pktw-justify-between pktw-pt-2">
				<Button variant="ghost" size="sm" onClick={onBack} className="pktw-gap-1">
					<ChevronLeft size={14} /> Back
				</Button>
				<Button size="sm" onClick={onDone} className="pktw-gap-1">
					{sqliteStatus === 'ready' ? 'Done' : 'Close'} <Check size={14} />
				</Button>
			</div>
		</div>
	);
}

// ─── Wizard root ──────────────────────────────────────────────────────

const TOTAL_STEPS = 3;

function OnboardingWizard({ onClose }: { onClose: () => void }) {
	const [step, setStep] = useState(0);

	return (
		<div className="pktw-flex pktw-flex-col">
			<StepIndicator current={step} total={TOTAL_STEPS} />
			{step === 0 && <WelcomeStep onNext={() => setStep(1)} />}
			{step === 1 && <ProviderStep onNext={() => setStep(2)} onBack={() => setStep(0)} />}
			{step === 2 && <SystemCheckStep onDone={onClose} onBack={() => setStep(1)} />}
		</div>
	);
}
