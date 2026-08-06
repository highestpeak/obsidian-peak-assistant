import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
	ArrowLeft,
	Check,
	ChevronDown,
	Copy,
	Database,
	Eye,
	FileText,
	GitBranch,
	Globe,
	Layers3,
	MessageSquare,
	Search,
	Sparkles,
	WrapText,
	X,
} from 'lucide-react';
import { Button } from '@/ui/component/shared-ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/ui/components/primitives';
import { usePromptInputContext } from '@/ui/component/prompt-input';
import { useChatDataStore } from '@/ui/store/chatDataStore';
import { useServiceContext } from '@/ui/context/ServiceContext';
import { useComposerStore } from '../../store/composerStore';
import { emptyComposerDraft } from '../../store/composerStore';
import { useEphemeralAssistantStore } from '../../store/ephemeralAssistantStore';
import { useChatStudioStrings } from '../../chatStudioStringsContext';
import type { TurnExecutionReceipt, ChatAssistantDefinition } from '@/core/types/chat-studio';
import type { ChatConversation } from '@/core/types/chat-vault';
import type { AnalysisHistoryRecord } from '@/core/ports/AnalysisHistoryPort';
import type { WorkingContext } from '@/service/context/types';
import {
	buildComposerContextPreview,
	type ComposerContextLayerPreview,
	type ComposerContextPreviewModel,
} from './composerContextModel';

type ComposerRunStatus = 'ready' | 'submitted' | 'streaming';

interface AsyncContextSources {
	assistant: ChatAssistantDefinition | null;
	workingContext: WorkingContext | null;
	userProfileMarkdown: string;
	analyses: AnalysisHistoryRecord[];
	lastReceipt: TurnExecutionReceipt | null;
}

const EMPTY_ASYNC_SOURCES: AsyncContextSources = {
	assistant: null,
	workingContext: null,
	userProfileMarkdown: '',
	analyses: [],
	lastReceipt: null,
};

const EMPTY_COMPOSER_DRAFT = emptyComposerDraft();

export interface ComposerContextStackProps {
	status: ComposerRunStatus;
	onOpenChange?: (open: boolean) => void;
}

function format(template: string, values: Record<string, string | number>): string {
	let result = template;
	for (const [key, value] of Object.entries(values)) {
		result = result.split(`{${key}}`).join(String(value));
	}
	return result;
}

function countMatches(text: string, query: string): number {
	const needle = query.trim().toLocaleLowerCase();
	if (!needle) return 0;
	const haystack = text.toLocaleLowerCase();
	let count = 0;
	let cursor = 0;
	while (cursor < haystack.length) {
		const index = haystack.indexOf(needle, cursor);
		if (index < 0) break;
		count += 1;
		cursor = index + Math.max(1, needle.length);
	}
	return count;
}

const HighlightedContent: React.FC<{ text: string; query: string }> = ({ text, query }) => {
	const needle = query.trim();
	if (!needle) return <>{text}</>;
	const lowerText = text.toLocaleLowerCase();
	const lowerNeedle = needle.toLocaleLowerCase();
	const parts: React.ReactNode[] = [];
	let cursor = 0;
	let key = 0;
	while (cursor < text.length) {
		const index = lowerText.indexOf(lowerNeedle, cursor);
		if (index < 0) {
			parts.push(text.slice(cursor));
			break;
		}
		if (index > cursor) parts.push(text.slice(cursor, index));
		parts.push(<mark key={`match-${key}`}>{text.slice(index, index + needle.length)}</mark>);
		key += 1;
		cursor = index + needle.length;
	}
	return <>{parts}</>;
};

function latestReceipt(receipts: TurnExecutionReceipt[]): TurnExecutionReceipt | null {
	let latest: TurnExecutionReceipt | null = null;
	for (const receipt of receipts) {
		const time = receipt.finishedAt ?? receipt.startedAt;
		const latestTime = latest ? latest.finishedAt ?? latest.startedAt : -1;
		if (time > latestTime) latest = receipt;
	}
	return latest;
}

function useContextSources(
	conversationId: string,
	assistantId: string | undefined,
	messageCount: number,
	refreshWhenOpen: boolean,
): AsyncContextSources {
	const { manager } = useServiceContext();
	const [sources, setSources] = useState<AsyncContextSources>(EMPTY_ASYNC_SOURCES);
	const sourceScopeRef = useRef(`${conversationId}:${assistantId ?? ''}`);

	useEffect(() => {
		let cancelled = false;
		const sourceScope = `${conversationId}:${assistantId ?? ''}`;
		if (sourceScopeRef.current !== sourceScope) {
			sourceScopeRef.current = sourceScope;
			setSources(EMPTY_ASYNC_SOURCES);
		}
		const load = async () => {
			const profileService = manager.getProfileService();
			const [assistant, userProfileMarkdown, analyses, receipts] = await Promise.all([
				assistantId
					? manager.assistant.get(assistantId).catch(() => null)
					: Promise.resolve(null),
				profileService?.getProfileAsMarkdown().catch(() => '') ?? Promise.resolve(''),
				manager.getAnalysisHistory().list({ limit: 3, offset: 0 }).catch(() => []),
				manager.conv.listTurnReceipts(conversationId).catch(() => []),
			]);
			if (cancelled) return;
			setSources({
				assistant,
				workingContext: manager.getWorkingContextSnapshot(),
				userProfileMarkdown,
				analyses,
				lastReceipt: latestReceipt(receipts),
			});
		};
		void load();
		return () => { cancelled = true; };
	}, [assistantId, conversationId, manager, messageCount, refreshWhenOpen]);

	return sources;
}

function layerStatus(layer: ComposerContextLayerPreview, strings: ReturnType<typeof useChatStudioStrings>): string {
	if (!layer.active) return strings.composerContext.empty;
	if (layer.completeness === 'preview') return strings.composerContext.previewOnly;
	return strings.composerContext.included;
}

const LayerDetail: React.FC<{
	layer: ComposerContextLayerPreview;
	phaseLabel: string;
	onClose: () => void;
	onOpenFull: () => void;
}> = ({ layer, phaseLabel, onClose, onOpenFull }) => {
	const strings = useChatStudioStrings();
	const copy = strings.composerContext;
	const previewLimit = strings.density.contextInlinePreviewChars;
	const truncated = layer.content.length > previewLimit;
	const preview = truncated ? layer.content.slice(0, previewLimit) : layer.content;
	return (
		<section className="pkchat-context-detail" aria-labelledby={`pkchat-context-detail-${layer.id}`}>
			<div className="pkchat-context-detail__head">
				<span>
					<small>{phaseLabel}</small>
					<strong id={`pkchat-context-detail-${layer.id}`}>{layer.title}</strong>
				</span>
				<Button variant="unstyled" size="icon" geometry="toolbar-icon" className="pkchat-context-detail__close" onClick={onClose} aria-label={copy.closeDetailLabel}>
					<X />
				</Button>
			</div>
			<div className="pkchat-context-detail__meta">
				<span><small>{copy.sourceLabel}</small><strong>{layer.source}</strong></span>
				<span><small>{copy.whyIncludedLabel}</small><strong>{layer.reason}</strong></span>
				<span><small>{copy.budgetLabel}</small><strong>{layer.maxTokens}</strong></span>
				<span><small>{copy.treatmentLabel}</small><strong>{layer.treatment}</strong></span>
			</div>
			<div className="pkchat-context-detail__body">
				<div className="pkchat-context-detail__label">
					<span>{copy.contentPreview}</span>
					<strong>{layer.completeness === 'preview' ? copy.previewOnly : copy.exactContent}</strong>
				</div>
				<pre data-composer-scroll-region="true">{preview}</pre>
				<div className="pkchat-context-detail__actions">
					<span>{truncated
						? format(copy.shownRangeTemplate, { shown: preview.length, total: layer.content.length })
						: copy.completeContent}</span>
					{truncated ? (
						<Button variant="unstyled" geometry="toolbar" className="pkchat-context-detail__open" onClick={onOpenFull}>
							{copy.openFullContent}
						</Button>
					) : null}
				</div>
			</div>
		</section>
	);
};

const FullLayerReader: React.FC<{
	layer: ComposerContextLayerPreview;
	phaseLabel: string;
	onBack: () => void;
}> = ({ layer, phaseLabel, onBack }) => {
	const strings = useChatStudioStrings();
	const copy = strings.composerContext;
	const [query, setQuery] = useState('');
	const [wrap, setWrap] = useState(true);
	const [copied, setCopied] = useState(false);
	const matches = countMatches(layer.content, query);

	const copyContent = async (event: React.MouseEvent<HTMLButtonElement>) => {
		const view = event.currentTarget.ownerDocument.defaultView;
		try {
			const clipboard = view?.navigator.clipboard;
			if (!clipboard) return;
			await clipboard.writeText(layer.content);
			setCopied(true);
			view?.setTimeout(() => setCopied(false), 1400);
		} catch {
			setCopied(false);
		}
	};

	return (
		<section
			className="pkchat-context-reader"
			data-wrap={wrap ? 'true' : 'false'}
			onKeyDown={(event) => {
				if (event.key !== 'Escape') return;
				event.preventDefault();
				event.stopPropagation();
				onBack();
			}}
		>
			<div className="pkchat-context-reader__head">
				<Button variant="unstyled" geometry="toolbar" className="pkchat-context-reader__back" onClick={onBack}>
					<ArrowLeft />{copy.backToStack}
				</Button>
				<span className="pkchat-context-reader__title"><small>{phaseLabel}</small><strong>{layer.title}</strong></span>
				<div className="pkchat-context-reader__actions">
					<Button variant="unstyled" geometry="toolbar" onClick={() => setWrap((value) => !value)} aria-pressed={wrap}>
						<WrapText />{wrap ? copy.wrap : copy.unwrap}
					</Button>
					<Button variant="unstyled" geometry="toolbar" onClick={copyContent}>
						{copied ? <Check /> : <Copy />}{copied ? copy.copied : copy.copyExact}
					</Button>
				</div>
			</div>
			<div className="pkchat-context-reader__toolbar">
				<label>
					<Search />
					<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={copy.searchPlaceholder} />
					<span>{query.trim() ? format(copy.searchResultsTemplate, { count: matches }) : copy.searchIdle}</span>
				</label>
				<div>
					<span>{layer.completeness === 'preview' ? copy.previewOnly : copy.exactContent}</span>
					<span>{format(copy.charactersTemplate, { count: layer.content.length })}</span>
					<span>{format(copy.tokensTemplate, { count: layer.tokenEstimate })}</span>
				</div>
			</div>
			<pre className="pkchat-context-reader__content" data-composer-scroll-region="true" tabIndex={0}>
				<HighlightedContent text={layer.content} query={query} />
			</pre>
			<div className="pkchat-context-reader__foot">
				<span><small>{copy.sourceLabel}</small><strong>{layer.source}</strong></span>
				<span><small>{copy.treatmentLabel}</small><strong>{layer.treatment}</strong></span>
			</div>
		</section>
	);
};

const ReceiptView: React.FC<{ receipt: TurnExecutionReceipt | null }> = ({ receipt }) => {
	const copy = useChatStudioStrings().composerContext;
	if (!receipt) return <div className="pkchat-context-receipt__empty">{copy.noReceipt}</div>;

	const requested = [
		receipt.requestedSources.project ? copy.receiptProject : null,
		receipt.requestedSources.vaultSearch ? copy.receiptVault : null,
		receipt.requestedSources.webSearch ? copy.receiptWeb : null,
		receipt.requestedSources.explicitRefs.length > 0
			? `${copy.receiptExplicit}: ${receipt.requestedSources.explicitRefs.length}`
			: null,
	].filter((value): value is string => Boolean(value));
	const actual = [
		receipt.actualSources.projectIncluded ? copy.receiptProject : null,
		receipt.actualSources.vaultDocuments.length > 0
			? `${copy.receiptVault}: ${receipt.actualSources.vaultDocuments.length}`
			: null,
		receipt.actualSources.webSources.length > 0
			? `${copy.receiptWeb}: ${receipt.actualSources.webSources.length}`
			: null,
		receipt.actualSources.explicitRefsUsed.length > 0
			? `${copy.receiptExplicit}: ${receipt.actualSources.explicitRefsUsed.length}`
			: null,
	].filter((value): value is string => Boolean(value));

	return (
		<section className="pkchat-context-receipt">
			<div className="pkchat-context-receipt__hero">
				<span><Sparkles /><span><strong>{copy.receiptTitle}</strong><small>{copy.receiptSubtitle}</small></span></span>
			</div>
			<div className="pkchat-context-receipt__grid">
				<span><small>{copy.receiptStatus}</small><strong>{receipt.status}</strong></span>
				<span><small>{copy.receiptModel}</small><strong>{receipt.effectiveModel.provider} · {receipt.effectiveModel.modelId}</strong></span>
				<span><small>{copy.receiptAssistant}</small><strong>{receipt.assistantId ?? copy.receiptNone}</strong></span>
				<span><small>{copy.receiptWorkflow}</small><strong>{receipt.workflowId ?? copy.receiptNone}</strong></span>
				<span><small>{copy.receiptRequestedSources}</small><strong>{requested.join(' · ') || copy.receiptNone}</strong></span>
				<span><small>{copy.receiptActualSources}</small><strong>{actual.join(' · ') || copy.receiptNone}</strong></span>
				<span><small>{copy.receiptArtifacts}</small><strong>{receipt.artifactIds.length || copy.receiptNone}</strong></span>
			</div>
			<div className="pkchat-context-receipt__notice">{copy.receiptSlotNotice}</div>
		</section>
	);
};

const Exclusions: React.FC = () => {
	const copy = useChatStudioStrings().composerContext;
	const rows = [
		{ icon: <Database />, title: copy.excludedVaultTitle, detail: copy.excludedVaultDetail },
		{ icon: <Globe />, title: copy.excludedWebTitle, detail: copy.excludedWebDetail },
		{ icon: <MessageSquare />, title: copy.excludedVariantsTitle, detail: copy.excludedVariantsDetail },
		{ icon: <GitBranch />, title: copy.excludedBranchTitle, detail: copy.excludedBranchDetail },
	];
	return (
		<aside className="pkchat-context-exclusions" data-composer-scroll-region="true">
			<div><strong>{copy.excludedTitle}</strong><small>{copy.excludedSubtitle}</small></div>
			{rows.map((row) => (
				<span key={row.title}>{row.icon}<span><strong>{row.title}</strong><small>{row.detail}</small></span></span>
			))}
		</aside>
	);
};

interface ActiveComposerContextStackProps extends ComposerContextStackProps {
	conversation: ChatConversation;
}

const ActiveComposerContextStack: React.FC<ActiveComposerContextStackProps> = ({
	conversation,
	status,
	onOpenChange,
}) => {
	const strings = useChatStudioStrings();
	const copy = strings.composerContext;
	const { manager } = useServiceContext();
	const { attachments } = usePromptInputContext();
	const project = useChatDataStore((state) => state.activeProject);
	const ephemeralAssistant = useEphemeralAssistantStore(
		(state) => state.previews[conversation.meta.id] ?? null,
	);
	const activeKey = useComposerStore((state) => state.activeKey);
	const storedDraft = useComposerStore((state) => state.drafts[activeKey]);
	const draft = storedDraft ?? EMPTY_COMPOSER_DRAFT;
	const [open, setOpen] = useState(false);
	const [mode, setMode] = useState<'next' | 'receipt'>('next');
	const [technical, setTechnical] = useState(false);
	const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
	const [fullLayerId, setFullLayerId] = useState<string | null>(null);
	const listRef = useRef<HTMLDivElement>(null);

	const sources = useContextSources(
		conversation.meta.id,
		conversation.meta.assistantId,
		conversation.messages.length,
		open,
	);
	const liveModel = useMemo(() => buildComposerContextPreview({
		conversation,
		project,
		draft,
		attachments: attachments.files.map((attachment) => attachment.file),
		assistant: ephemeralAssistant ?? sources.assistant,
		workingContext: sources.workingContext,
		userProfileMarkdown: sources.userProfileMarkdown,
		analyses: sources.analyses,
		lastReceipt: sources.lastReceipt,
		vaultAvailable: manager.conv.isVaultSearchAvailable(),
		copy,
	}), [attachments.files, conversation, copy, draft, ephemeralAssistant, manager, project, sources]);
	const frozenModelRef = useRef<ComposerContextPreviewModel>(liveModel);
	useEffect(() => {
		if (status === 'ready') frozenModelRef.current = liveModel;
	}, [liveModel, status]);
	const model = status === 'ready' ? liveModel : frozenModelRef.current;
	const phaseLabel = status === 'ready' ? copy.phaseExpected : copy.phaseFrozen;
	const selectedLayer = model.layers.find((layer) => layer.id === selectedLayerId) ?? null;
	const fullLayer = model.layers.find((layer) => layer.id === fullLayerId) ?? null;

	const changeOpen = (next: boolean) => {
		setOpen(next);
		onOpenChange?.(next);
		if (next) return;
		setMode('next');
		setFullLayerId(null);
		setSelectedLayerId(null);
	};

	const moveLayerFocus = (event: React.KeyboardEvent<HTMLDivElement>) => {
		if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
		const buttons = Array.from(listRef.current?.querySelectorAll<HTMLButtonElement>('[data-context-layer]') ?? []);
		if (buttons.length === 0) return;
		const active = event.currentTarget.ownerDocument.activeElement;
		const current = buttons.indexOf(active as HTMLButtonElement);
		const direction = event.key === 'ArrowDown' ? 1 : -1;
		const next = current < 0 ? 0 : (current + direction + buttons.length) % buttons.length;
		event.preventDefault();
		buttons[next]?.focus();
	};

	return (
		<Popover open={open} onOpenChange={changeOpen}>
			<PopoverTrigger asChild>
				<Button
					variant="unstyled"
					type="button"
					className="pkchat-context-rail"
					data-state={open ? 'open' : 'closed'}
					aria-label={copy.popoverTitle}
				>
					<span className="pkchat-context-rail__title"><Eye /><strong>{copy.railTitle}</strong></span>
					<span className="pkchat-context-rail__summary">{format(copy.railSummaryTemplate, {
						history: model.recentMessageCount,
						resources: model.resourceCount,
					})}</span>
					<span className="pkchat-context-rail__count">
						<strong>{format(copy.railCountTemplate, { active: model.activeCount })}</strong><ChevronDown />
					</span>
				</Button>
			</PopoverTrigger>
			<PopoverContent
				align="start"
				side="top"
				sideOffset={8}
				className="pkchat-context-popover"
				collisionPadding={12}
			>
				<div className="pkchat-context-popover__head">
					<span><strong>{mode === 'next' ? copy.popoverTitle : copy.receiptTitle}</strong><small>{mode === 'next' ? copy.popoverSubtitle : copy.receiptSubtitle}</small></span>
					<span>{model.layers.length}</span>
				</div>
				<div className="pkchat-context-popover__tabs" role="tablist">
					<Button variant="unstyled" geometry="toolbar" role="tab" aria-selected={mode === 'next'} data-active={mode === 'next' ? 'true' : undefined} onClick={() => setMode('next')}>{copy.nextMessageTab}</Button>
					<Button variant="unstyled" geometry="toolbar" role="tab" aria-selected={mode === 'receipt'} data-active={mode === 'receipt' ? 'true' : undefined} onClick={() => setMode('receipt')}>{copy.lastReceiptTab}</Button>
				</div>
				{mode === 'receipt' ? <ReceiptView receipt={model.lastReceipt} /> : fullLayer ? (
					<FullLayerReader layer={fullLayer} phaseLabel={phaseLabel} onBack={() => setFullLayerId(null)} />
				) : (
					<>
						<div className="pkchat-context-metrics">
							<span data-phase="true">{phaseLabel}</span>
							<span>{format(copy.metricsTemplate, { active: model.activeCount, empty: model.emptyCount })}</span>
							<span>{copy.autoBudget}</span>
							<Button variant="unstyled" geometry="toolbar" aria-pressed={technical} onClick={() => setTechnical((value) => !value)}>{copy.technicalDetails}</Button>
						</div>
						<div className="pkchat-context-layout">
							<div className="pkchat-context-stack" data-composer-scroll-region="true" ref={listRef} onKeyDown={moveLayerFocus}>
								{model.layers.map((layer) => (
									<React.Fragment key={layer.id}>
										<Button
											variant="unstyled"
											type="button"
											className="pkchat-context-layer"
											data-context-layer={layer.id}
											data-active={layer.active ? 'true' : 'false'}
											aria-expanded={selectedLayerId === layer.id}
											onClick={() => setSelectedLayerId((current) => current === layer.id ? null : layer.id)}
										>
											<span className="pkchat-context-layer__order">{String(layer.order).padStart(2, '0')}</span>
											<span className="pkchat-context-layer__copy">
												<strong>{layer.title}</strong><small>{layer.description}</small>
												{technical ? <em>{format(copy.technicalTemplate, { priority: layer.priority, maxTokens: layer.maxTokens, compression: layer.maxCompressionLevel })}</em> : null}
											</span>
											<span className="pkchat-context-layer__tail"><small>{layer.required ? copy.required : copy.optional}</small><strong data-empty={!layer.active ? 'true' : undefined}>{layerStatus(layer, strings)}</strong><ChevronDown /></span>
										</Button>
										{selectedLayerId === layer.id && selectedLayer ? (
											<LayerDetail layer={selectedLayer} phaseLabel={phaseLabel} onClose={() => setSelectedLayerId(null)} onOpenFull={() => setFullLayerId(layer.id)} />
										) : null}
									</React.Fragment>
								))}
							</div>
							<Exclusions />
						</div>
						<section className="pkchat-context-request">
							<div><strong>{copy.requestScopeTitle}</strong><small>{copy.requestScopeSubtitle}</small></div>
							{model.requestScope.length > 0 ? (
								<div>{model.requestScope.map((item) => <span key={item.id}><FileText /><span><strong>{item.label}</strong>{item.detail ? <small>{item.detail}</small> : null}</span></span>)}</div>
							) : <small>{copy.requestScopeEmpty}</small>}
						</section>
					</>
				)}
			</PopoverContent>
		</Popover>
	);
};

export const ComposerContextStack: React.FC<ComposerContextStackProps> = (props) => {
	const conversation = useChatDataStore((state) => state.activeConversation);
	if (!conversation) return null;
	return <ActiveComposerContextStack {...props} conversation={conversation} />;
};
