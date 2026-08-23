import * as React from 'react';
import {
	ArrowLeft,
	ArrowUpDown,
	BadgeInfo,
	BarChart3,
	Check,
	ChevronDown,
	ChevronRight,
	CircleHelp,
	Code,
	Columns3,
	Database,
	Heading,
	LayoutDashboard,
	Lightbulb,
	Link,
	ListChecks,
	ListPlus,
	ListTree,
	MessageSquare,
	MessageSquareWarning,
	OctagonAlert,
	PenTool,
	Quote,
	Ruler,
	Scale,
	Search,
	ShieldAlert,
	Sigma,
	Sparkles,
	Table,
	Tag,
	Text,
	Workflow,
	X,
} from 'lucide-react';
import type {
	ComposerActionDescriptor,
	ComposerCandidate,
	ComposerCapabilityCatalogItem,
	ComposerCapabilityId,
	ComposerContextSnapshot,
} from '@/core/composer';
import { composerTargetBlockId } from '@/core/composer';
import { ProfileRegistry } from '@/core/profiles/ProfileRegistry';
import type { ModelSelection } from '@/core/types/chat-studio';
import {
	Button,
	IconButton,
	Popover,
	PopoverContent,
	PopoverItem,
	PopoverTrigger,
} from '@/ui/components/primitives';
import {
	ChatStudioStringsProvider,
	useChatStudioStrings,
} from '@/ui/view/chat-view/chatStudioStringsContext';
import { buildProfileModelItems } from '@/ui/component/model-picker/modelPickerData';
import { useComposerChrome } from '../chrome/ComposerChromeContext';
import { BriefView } from './BriefView';
import { RunReceiptCard } from './RunReceiptCard';
import { useSessionProjection, useSidecar } from './SidecarContext';
import type { SidecarStrings } from './sidecarConfig';
import { AIInstructionComposer } from '@/ui/component/instruction-composer';
import { useRovingComposite } from '@/ui/keyboard/useRovingComposite';

export {
	BriefView,
	BriefViewContent,
	SensingControl,
	type BriefViewContentProps,
	type RelatedLoadState,
} from './BriefView';

/**
 * Peak Composer — Copilot lifecycle projection. The Brief itself lives in its
 * own design-source component so session/review code cannot flatten its layout
 * back into a generic list of buttons.
 */
export function CopilotView(): React.ReactElement {
	const { runtime } = useSidecar();
	const projection = useSessionProjection(runtime);
	if (projection.surface === 'talk') return <TalkView />;
	return <BriefView />;
}

/** The real Copilot conversation, separate from proactive Suggestions. */
export function TalkView(): React.ReactElement {
	return (
		<ChatStudioStringsProvider>
			<SessionView />
		</ChatStudioStringsProvider>
	);
}

// ── session ─────────────────────────────────────────────────────────────────

function SessionView(): React.ReactElement {
	const {
		runtime,
		hub,
		workspaceRuntime,
		config,
		getFocusedBlockId,
		resolveFocusContext,
		presentationOrigin,
	} = useSidecar();
	const { projection: capabilityProjection, runtime: chromeRuntime } = useComposerChrome();
	const projection = useSessionProjection(runtime);
	const s = config.strings;
	const externalRuns = React.useRef(new Map<string, string>());
	const candidates = React.useRef<readonly ComposerCandidate[]>([]);
	const activeCancelRef = React.useRef<(() => void) | null>(null);
	const [instruction, setInstruction] = React.useState('');
	const recommendedRef = React.useRef<HTMLDivElement | null>(null);
	const quickActionsRef = React.useRef<HTMLDivElement | null>(null);
	useRovingComposite(recommendedRef, {
		itemSelector: '.pk-session-suggestion:not([disabled])',
		orientation: 'vertical',
		rememberBy: 'data-capability-id',
	});
	useRovingComposite(quickActionsRef, {
		itemSelector: 'button:not([disabled])',
		orientation: 'horizontal',
		rememberBy: 'data-capability-id',
	});

	const documentFallback = (): { snapshot: ComposerContextSnapshot; targetQuote: string } => ({
		snapshot: {
			documentId: 'document',
			revision: hub?.currentRevision ?? 'r0',
			target: { kind: 'document', documentId: 'document' },
			targetSource: '',
			nearby: { before: '', after: '' },
		},
		targetQuote: '',
	});

	const focused = getFocusedBlockId?.() ?? null;
	const context = resolveFocusContext?.(focused) ?? documentFallback();
	const capabilities = collectAiCapabilities(capabilityProjection, context.snapshot);
	const availableCapabilities = capabilities.filter((action) => !action.disabledReason);
	const capabilityCatalog = capabilityProjection.catalogFor?.(context.snapshot)
		?? capabilities.map((action) => ({
			capabilityId: action.capabilityId,
			title: action.title,
			...(action.description ? { description: action.description } : {}),
			...(action.lucideIcon ? { lucideIcon: action.lucideIcon } : {}),
			action: action.disabledReason ? undefined : action,
			targetKinds: [],
		}));
	const [selectedCapabilityId, setSelectedCapabilityId] = React.useState<ComposerCapabilityId | null>(
		projection.pendingCapabilityId ?? availableCapabilities[0]?.capabilityId ?? null,
	);
	const activeAgentProfile = ProfileRegistry.getInstance().getActiveAgentProfile();
	const copilotProfiles = React.useMemo(
		() => activeAgentProfile ? [activeAgentProfile] : [],
		[activeAgentProfile],
	);
	const [modelSelection, setModelSelection] = React.useState<ModelSelection>({ mode: 'auto' });
	const selectedProfileId = modelSelection.mode === 'fixed' ? modelSelection.profileId : null;
	const selectedModelId = modelSelection.mode === 'fixed' ? modelSelection.modelId : null;
	const selectedCapability = capabilities.find((action) => action.capabilityId === selectedCapabilityId)
		?? availableCapabilities[0]
		?? null;

	React.useEffect(() => {
		if (selectedCapabilityId && capabilities.some((action) => action.capabilityId === selectedCapabilityId)) return;
		setSelectedCapabilityId(projection.pendingCapabilityId ?? availableCapabilities[0]?.capabilityId ?? null);
	}, [availableCapabilities, capabilities, projection.pendingCapabilityId, selectedCapabilityId]);

	React.useEffect(() => {
		const candidateRuntime = chromeRuntime.candidateRuntime;
		if (!candidateRuntime) return;
		const unsubscribeCandidates = candidateRuntime.subscribe((next) => {
			candidates.current = next;
		});
		const unsubscribeEvents = candidateRuntime.onRunEvent((event) => {
			const sessionRunId = externalRuns.current.get(event.runId);
			if (!sessionRunId) return;
			if (event.type === 'run-started' || event.type === 'content-delta') {
				runtime.session.markStreaming(sessionRunId);
				return;
			}
			if (event.type === 'run-failed') {
				activeCancelRef.current = null;
				runtime.session.markError(sessionRunId, event.error);
				return;
			}
			if (event.type === 'run-cancelled') {
				activeCancelRef.current = null;
				runtime.session.markCancelled(sessionRunId);
				return;
			}
			const candidate = candidates.current.find((entry) => entry.candidateId === event.candidateId);
			if (!candidate) {
				runtime.session.markNoChange(sessionRunId);
				return;
			}
			const action = candidateRuntime.candidateLabelFor?.(candidate.candidateId)
				?? runtime.session.projection().sessionTitle
				?? s.tabCopilot;
			runtime.session.markProposed(sessionRunId, {
				action,
				changes: [{
					id: candidate.candidateId,
					changeId: candidate.candidateId,
					label: action,
					target: candidate.target,
				}],
				trace: [{
					id: event.runId,
					label: action,
					kind: 'capability',
					status: 'ok',
				}],
			});
			activeCancelRef.current = null;
		});
		return () => {
			unsubscribeCandidates();
			unsubscribeEvents();
		};
	}, [chromeRuntime.candidateRuntime, runtime, s.tabCopilot]);

	const onSend = (text: string) => {
		if (!text.trim()) return;
		if (!selectedCapability) return;
		const frozen = runtime.session.send({
			snapshot: context.snapshot,
			targetQuote: context.targetQuote || text.trim(),
			instruction: text.trim(),
			capabilityId: selectedCapability.capabilityId,
			presentationOrigin,
		});
		try {
			const handle = capabilityProjection.invoke(
				selectedCapability.capabilityId,
				context.snapshot,
				{
					instruction: text.trim(),
					...(selectedProfileId && selectedModelId
						? { profileId: selectedProfileId, modelId: selectedModelId }
						: {}),
				},
			);
			externalRuns.current.set(handle.runId, frozen.runId);
			activeCancelRef.current = handle.cancel;
			if (presentationOrigin) {
				workspaceRuntime?.attachPresentationOrigin(handle.runId, presentationOrigin);
			}
			runtime.session.linkExternalRun(handle.runId, frozen.runId);
			runtime.session.markStreaming(frozen.runId);
		} catch (error) {
			runtime.session.markError(frozen.runId, error instanceof Error ? error.message : String(error));
		}
	};

	const chooseCapability = (action: ComposerActionDescriptor): void => {
		if (action.disabledReason) return;
		setSelectedCapabilityId(action.capabilityId);
		setInstruction(action.title);
	};

	const contextLabel = formatCopilotContextLabel(
		context.targetQuote || context.snapshot.targetSource,
		s.currentDocument,
	);
	const instructionStatus = projection.runStatus === 'assembling'
		? 'submitting' as const
		: projection.runStatus === 'streaming'
			? 'streaming' as const
			: projection.runStatus === 'error'
				? 'error' as const
				: 'idle' as const;

	return (
		<div className="pk-session" data-testid="pk-session">
			<div className="pk-session-head">
				<span className="pk-session-title">{projection.sessionTitle ?? s.tabCopilot}</span>
			</div>
			<div className="pk-session-thread">
				{projection.receipts.length === 0 && (
					<div className="pk-session-start">
						<div className="pk-session-start-heading">
							<span className="pk-session-start-icon"><Sparkles size={16} /></span>
							<span>
								<strong>{s.sessionStartTitle}</strong>
								<small>{s.sessionStartBody}</small>
							</span>
						</div>
						<div className="pk-session-start-context">
							<i aria-hidden />
							<span>{formatPresentationOrigin(presentationOrigin, s) ?? s.currentContext}</span>
							<strong>{contextLabel}</strong>
						</div>
						<div ref={recommendedRef} className="pk-session-start-actions" aria-label={s.capabilityRecommendedGroup}>
							{availableCapabilities.slice(0, 3).map((action) => (
								<Button
									key={action.capabilityId}
									className="pk-session-suggestion"
									data-capability-id={action.capabilityId}
									variant="outline"
									onClick={() => chooseCapability(action)}
								>
									<Sparkles aria-hidden />
									<span>
										<strong>{action.title}</strong>
										{action.description && <small>{action.description}</small>}
									</span>
									<ChevronRight aria-hidden />
								</Button>
							))}
							{availableCapabilities.length === 0 && (
								<span className="pk-session-unavailable">{s.noAvailableCapabilities}</span>
							)}
						</div>
					</div>
				)}
				{projection.receipts.map((receipt) => (
					<RunReceiptCard key={receipt.runId} receipt={receipt} />
				))}
			</div>
			<div className="pk-session-composer">
				<div ref={quickActionsRef} className="pk-session-quick-actions">
					{availableCapabilities.slice(0, 3).map((action) => (
						<Button
							key={action.capabilityId}
							variant={selectedCapability?.capabilityId === action.capabilityId ? 'secondary' : 'ghost'}
							data-capability-id={action.capabilityId}
							onClick={() => chooseCapability(action)}
						>
							{action.title}
						</Button>
					))}
					<CapabilityPicker
						catalog={capabilityCatalog}
						selectedId={selectedCapability?.capabilityId ?? null}
						onChoose={chooseCapability}
						strings={s}
					/>
				</div>
				{projection.pendingCommentRefs.length > 0 && (
					<div className="pk-session-comment-sources" aria-label={s.commentSource}>
						{projection.pendingCommentRefs.map((source) => (
							<div
								key={source.commentId}
								className="pk-session-comment-source"
								data-trust={source.trust}
							>
								<MessageSquare size={13} aria-hidden />
								<span className="pk-session-comment-source__label">{s.commentSource}</span>
								<span className="pk-session-comment-source__quote">
									{source.quote || source.body}
								</span>
								{source.trust === 'external' && (
									<span
										className="pk-session-comment-source__trust"
										title={s.externalCommentWarning}
									>
										<ShieldAlert size={12} aria-hidden />
										{s.externalCommentWarning}
									</span>
								)}
							</div>
						))}
					</div>
				)}
				<AIInstructionComposer
					surface="composer"
					capabilityId={selectedCapability?.capabilityId ?? 'composer.unavailable'}
					value={instruction}
					onValueChange={setInstruction}
					onSubmit={(submission) => onSend(submission.instruction)}
					onStop={() => {
						activeCancelRef.current?.();
						activeCancelRef.current = null;
						if (projection.activeRunId) runtime.session.markCancelled(projection.activeRunId);
					}}
					status={instructionStatus}
					placeholder={s.askComposerPlaceholder}
					context={[{
						id: `${context.snapshot.documentId}:${context.snapshot.revision}`,
						kind: context.snapshot.target.kind === 'document' ? 'vault-file' : 'selection',
						label: contextLabel,
						source: 'automatic',
					}]}
					draftKey={`composer:${context.snapshot.documentId}`}
					submitDisabled={!selectedCapability}
					autoFocus
					trailingControls={(
						<CopilotModelSelector
							selection={modelSelection}
							onSelect={setModelSelection}
							profiles={copilotProfiles}
						/>
					)}
				/>
			</div>
		</div>
	);
}

function CopilotModelSelector({
	selection,
	onSelect,
	profiles,
}: {
	selection: ModelSelection;
	onSelect: (selection: ModelSelection) => void;
	profiles: readonly import('@/core/profiles/types').Profile[];
}): React.ReactElement {
	const strings = useChatStudioStrings();
	const [open, setOpen] = React.useState(false);
	const items = React.useMemo(() => buildProfileModelItems(profiles), [profiles]);
	const selected = selection.mode === 'fixed'
		? items.find((item) => item.profileId === selection.profileId && item.modelId === selection.modelId)
		: null;
	const label = selected
		? `${selected.profileName} · ${selected.displayName ?? selected.modelId}`
		: strings.composer.modelAutoLabel;
	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<Button
					variant="ghost"
					size="sm"
					className="pk-session-model-trigger"
					aria-label={strings.composer.modelAutoLabel}
				>
					<Sparkles size={13} aria-hidden />
					<span>{label}</span>
					<ChevronDown size={13} aria-hidden />
				</Button>
			</PopoverTrigger>
			<PopoverContent
				align="end"
				side="top"
				sideOffset={8}
				className="pk-session-model-popover"
			>
				<PopoverItem
					className="pk-session-model-row"
					data-selected={selection.mode === 'auto' ? 'true' : undefined}
					onClick={() => {
						onSelect({ mode: 'auto' });
						setOpen(false);
					}}
				>
					<Sparkles aria-hidden />
					<span>{strings.composer.modelAutoLabel}</span>
					{selection.mode === 'auto' ? <Check aria-hidden /> : null}
				</PopoverItem>
				{items.map((item) => {
					const isSelected = selection.mode === 'fixed'
						&& selection.profileId === item.profileId
						&& selection.modelId === item.modelId;
					return (
						<PopoverItem
							key={`${item.profileId}:${item.modelId}`}
							className="pk-session-model-row"
							data-selected={isSelected ? 'true' : undefined}
							onClick={() => {
								onSelect({ mode: 'fixed', profileId: item.profileId, modelId: item.modelId });
								setOpen(false);
							}}
						>
							<span className="pk-session-model-row__mark">{item.profileName.slice(0, 1)}</span>
							<span>
								<strong>{item.displayName ?? item.modelId}</strong>
								<small>{item.profileName}</small>
							</span>
							{isSelected ? <Check aria-hidden /> : null}
						</PopoverItem>
					);
				})}
			</PopoverContent>
		</Popover>
	);
}

function CapabilityPicker({
	catalog,
	selectedId,
	onChoose,
	strings,
}: {
	catalog: readonly ComposerCapabilityCatalogItem[];
	selectedId: ComposerCapabilityId | null;
	onChoose: (action: ComposerActionDescriptor) => void;
	strings: SidecarStrings;
}): React.ReactElement {
	const [open, setOpen] = React.useState(false);
	const [query, setQuery] = React.useState('');
	const triggerRef = React.useRef<HTMLButtonElement | null>(null);
	const dialogRef = React.useRef<HTMLDivElement | null>(null);
	useRovingComposite(dialogRef, {
		itemSelector: '.pk-capability-row:not([disabled])',
		orientation: 'vertical',
		rememberBy: 'data-capability-id',
		enabled: open,
	});
	const closePicker = (): void => {
		setOpen(false);
		setQuery('');
		triggerRef.current?.ownerDocument.defaultView?.requestAnimationFrame(() => {
			if (triggerRef.current?.isConnected) triggerRef.current.focus({ preventScroll: true });
		});
	};
	const normalized = query.trim().toLocaleLowerCase();
	const filtered = catalog.filter((item) => {
		if (!normalized) return true;
		return `${item.title} ${item.description ?? ''} ${item.targetKinds.join(' ')}`
			.toLocaleLowerCase()
			.includes(normalized);
	});
	const recommended = filtered.filter((item) => item.action);
	const other = filtered.filter((item) => !item.action);
	return (
		<>
			<Button ref={triggerRef} className="pk-capability-picker-trigger" variant="ghost" onClick={() => setOpen(true)}>
				{strings.allCapabilities}
				<ChevronDown size={12} />
			</Button>
			{open && (
				<div className="pk-capability-dialog-backdrop" onMouseDown={closePicker}>
					<div
						ref={dialogRef}
						className="pk-capability-dialog"
						role="dialog"
						aria-modal="true"
						aria-label={strings.capabilityDialogTitle}
						onMouseDown={(event) => event.stopPropagation()}
						onKeyDown={(event) => {
							if (event.key === 'Escape') {
								event.preventDefault();
								event.stopPropagation();
								closePicker();
								return;
							}
							if (event.key === 'Tab') trapDialogTab(event, event.currentTarget);
						}}
					>
						<div className="pk-capability-dialog-head">
							<span>
								<strong>{strings.capabilityDialogTitle}</strong>
								<small>{strings.capabilityDialogSubtitle}</small>
							</span>
							<IconButton label={strings.close} onClick={closePicker}>
								<X aria-hidden />
							</IconButton>
						</div>
						<label className="pk-capability-search">
							<Search aria-hidden />
							<input
								autoFocus
								value={query}
								placeholder={strings.capabilitySearchPlaceholder}
								onChange={(event) => setQuery(event.currentTarget.value)}
							/>
						</label>
						<div className="pk-capability-dialog-body">
							{filtered.length === 0 && (
								<span className="pk-capability-empty">{strings.capabilityNoResults}</span>
							)}
							{recommended.length > 0 && (
								<CapabilityDialogGroup
									items={recommended}
									label={strings.capabilityRecommendedGroup}
									statusLabel={strings.capabilityAvailable}
									selectedId={selectedId}
									onChoose={(action) => {
										onChoose(action);
										closePicker();
									}}
								/>
							)}
							{other.length > 0 && (
								<CapabilityDialogGroup
									items={other}
									label={strings.capabilityOtherGroup}
									statusLabel={strings.capabilityOtherObject}
									selectedId={selectedId}
									onChoose={() => undefined}
								/>
							)}
						</div>
					</div>
				</div>
			)}
		</>
	);
}

function CapabilityDialogGroup({
	items,
	label,
	statusLabel,
	selectedId,
	onChoose,
}: {
	items: readonly ComposerCapabilityCatalogItem[];
	label: string;
	statusLabel: string;
	selectedId: ComposerCapabilityId | null;
	onChoose: (action: ComposerActionDescriptor) => void;
}): React.ReactElement {
	return (
		<section className="pk-capability-group">
			<div className="pk-capability-group-head">
				<span>{label}</span>
				<small>{items.length}</small>
			</div>
			{items.map((item) => (
				<Button
					key={item.capabilityId}
					className="pk-capability-row"
					data-capability-id={item.capabilityId}
					variant="ghost"
					disabled={!item.action}
					title={!item.action ? statusLabel : undefined}
					onClick={() => {
						if (item.action) onChoose(item.action);
					}}
				>
					<span className="pk-capability-row-icon">
						<CapabilityIcon name={item.lucideIcon} />
					</span>
					<span className="pk-capability-row-copy">
						<strong>{item.title}</strong>
						<small>{item.description}</small>
						<em>{statusLabel}</em>
					</span>
					{selectedId === item.capabilityId ? <Check aria-hidden /> : <ChevronRight aria-hidden />}
				</Button>
			))}
		</section>
	);
}

function CapabilityIcon({ name }: { name?: string }): React.ReactElement {
	const icons: Record<string, React.ComponentType<{ 'aria-hidden'?: boolean }>> = {
		'arrow-up-down': ArrowUpDown,
		'badge-info': BadgeInfo,
		'bar-chart-3': BarChart3,
		'circle-help': CircleHelp,
		code: Code,
		'columns-3': Columns3,
		database: Database,
		heading: Heading,
		'layout-dashboard': LayoutDashboard,
		lightbulb: Lightbulb,
		link: Link,
		'list-checks': ListChecks,
		'list-plus': ListPlus,
		'list-tree': ListTree,
		'message-square-warning': MessageSquareWarning,
		'octagon-alert': OctagonAlert,
		'pen-tool': PenTool,
		quote: Quote,
		ruler: Ruler,
		scale: Scale,
		sigma: Sigma,
		sparkles: Sparkles,
		table: Table,
		tag: Tag,
		text: Text,
		workflow: Workflow,
	};
	const Icon = icons[name ?? 'sparkles'] ?? Sparkles;
	return <Icon aria-hidden />;
}

function trapDialogTab(event: React.KeyboardEvent<HTMLElement>, dialog: HTMLElement): void {
	const focusable = Array.from(dialog.querySelectorAll<HTMLElement>([
		'button:not([disabled])',
		'input:not([disabled])',
		'textarea:not([disabled])',
		'[tabindex]:not([tabindex="-1"])',
	].join(','))).filter((element) => {
		if (element.hidden || element.getAttribute('aria-hidden') === 'true') return false;
		return element.ownerDocument.defaultView?.getComputedStyle(element).display !== 'none';
	});
	if (focusable.length === 0) return;
	const first = focusable[0];
	const last = focusable[focusable.length - 1];
	if (event.shiftKey && dialog.ownerDocument.activeElement === first) {
		event.preventDefault();
		last.focus();
		return;
	}
	if (!event.shiftKey && dialog.ownerDocument.activeElement === last) {
		event.preventDefault();
		first.focus();
	}
}

function collectAiCapabilities(
	projection: ReturnType<typeof useComposerChrome>['projection'],
	snapshot: ComposerContextSnapshot,
): ComposerActionDescriptor[] {
	const byId = new Map<ComposerCapabilityId, ComposerActionDescriptor>();
	for (const surface of ['block-row', 'selection-toolbar', 'object-toolbar'] as const) {
		for (const action of projection.actionsFor(snapshot, surface)) {
			if (action.group !== 'ai' || byId.has(action.capabilityId)) continue;
			byId.set(action.capabilityId, action);
		}
	}
	return [...byId.values()];
}

export function formatCopilotContextLabel(source: string, fallback: string): string {
	const firstMeaningfulLine = source
		.split(/\r?\n/)
		.map((line) => line.trim())
		.find((line) => line && line !== '---' && !/^[\w-]+\s*:/.test(line));
	if (!firstMeaningfulLine) return fallback;
	const plain = firstMeaningfulLine
		.replace(/^#{1,6}\s+/, '')
		.replace(/^(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?/, '')
		.trim();
	if (plain.length <= 72) return plain;
	return `${plain.slice(0, 69).trimEnd()}…`;
}

function formatPresentationOrigin(
	origin: import('@/core/composer').IntelligencePresentationOrigin | null | undefined,
	strings: SidecarStrings,
): string | null {
	if (!origin) return null;
	if (origin.kind === 'automatic-suggestion') return strings.originAutomaticSuggestion;
	if (origin.kind === 'ask-copilot') return strings.originAskCopilot;
	if (origin.kind === 'comment-handoff') return strings.originCommentHandoff;
	if (origin.kind === 'history-deep-link') return strings.originHistoryDeepLink;
	return strings.originNativeEditor;
}

// ── review (transient) ──────────────────────────────────────────────────────

function ReviewView(): React.ReactElement {
	const { runtime, config, onLocate } = useSidecar();
	const projection = useSessionProjection(runtime);
	const s = config.strings;
	const receipt = projection.receipts.find((entry) => entry.runId === projection.activeRunId);
	const reviewRef = React.useRef<HTMLDivElement | null>(null);
	useRovingComposite(reviewRef, {
		itemSelector: '.pk-review-item:not([disabled])',
		orientation: 'vertical',
		rememberBy: 'data-change-id',
	});
	return (
		<div className="pk-review" data-testid="pk-review">
			<div className="pk-session-head">
				<IconButton className="pk-back-btn" label={s.back} onClick={() => runtime.session.closeReview()}>
					<ArrowLeft size={14} />
				</IconButton>
				<span className="pk-session-title">{receipt?.action ?? s.reviewClose}</span>
			</div>
			<div ref={reviewRef} className="pk-review-list">
				{(receipt?.changes ?? []).map((change) => (
					<Button
						key={change.changeId}
						className="pk-review-item"
						data-change-id={change.changeId}
						variant="ghost"
						onClick={() => {
							const blockId = composerTargetBlockId(change.target);
							if (blockId) onLocate?.(blockId);
						}}
					>
						<span className="pk-review-item-label">{change.label}</span>
						<ChevronRight size={13} />
					</Button>
				))}
			</div>
			<Button className="pk-review-close" variant="outline" onClick={() => runtime.session.closeReview()}>
				{s.reviewClose}
			</Button>
		</div>
	);
}
