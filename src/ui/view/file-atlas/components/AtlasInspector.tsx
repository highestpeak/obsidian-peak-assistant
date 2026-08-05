/**
 * File Atlas — Inspector (Phase 1).
 *
 * Right pane detail for the selected node. Each selection has one canonical
 * preview, followed only by actions that operate on that block and compact
 * review evidence when it exists. Composer quick actions reuse the Composer
 * runtime; generic element counts and duplicated identity/context rows stay out
 * of this surface.
 */

import React, { type CSSProperties, useEffect, useMemo, useRef, useState } from 'react';
import {
	BarChart3,
	Check,
	Copy,
	Eye,
	ExternalLink,
	Hash,
	Link as LinkIcon,
	Plus,
	Sparkles,
	WandSparkles,
} from 'lucide-react';
import type { ComposerCapabilityId } from '@/core/composer';
import type { DocumentBlock } from '@/core/document/atlas/types';
import { RawBlockKind } from '@/core/document/atlas/types';
import { Button } from '@/ui/component/shared-ui/button';
import { StreamdownIsolated } from '@/ui/component/mine';
import type { FileAtlasConfig } from '../config/fileAtlasConfig';
import type {
	AtlasCopilotSuggestion,
	AtlasCopilotSuggestionSnapshot,
	AtlasImageInfo,
	AtlasQuickAction,
	FileAtlasHostPort,
} from '../FileAtlasHostPort';
import { iconForKind } from '../config/kindIcons';
import {
	analysisText,
	keywordsOf,
	sectionText,
	statisticsOf,
} from '../atlasTreeModel';
import {
	cleanInlineMarkdown,
	displayIdentity,
	inspectorCardPolicy,
} from '../atlasDisplayModel';
import { useRovingComposite } from '@/ui/keyboard/useRovingComposite';
import { AIGraphContextArtifacts } from '@/ui/component/ai-graph';
import {
	buildAtlasElementContext,
	compactStructuredPreviewRows,
	filterAtlasQuickActions,
	groupAtlasCopilotSuggestions,
	type AtlasElementContext,
} from '../atlasInspectorModel';

interface AtlasInspectorProps {
	block: DocumentBlock | null;
	blocks: DocumentBlock[];
	config: FileAtlasConfig;
	host: FileAtlasHostPort;
	sourcePath: string;
	inTray: boolean;
	onAddToTray: (block: DocumentBlock) => void;
	onCopyLink: (block: DocumentBlock) => void;
	onRunQuickAction: (block: DocumentBlock, capabilityId: ComposerCapabilityId) => void;
}

/**
 * Kinds shown through the real StreamdownIsolated renderer instead of a raw
 * source dump. Prose, tasks, callouts, and fenced code all render as Markdown so
 * bold / bullets / checkboxes / syntax highlighting show instead of leaking `**`,
 * `- [ ]`, and ``` markers — a raw preview reads worse than the note itself. Only
 * one instance mounts per selection (the inspected block), so the cost is bounded.
 * Footnote definitions are excluded: a standalone `[^id]:` def has no reference to
 * bind to and renders empty, so it stays a mono snippet. Tables get their own
 * lightweight preview.
 */
const RENDERED_KINDS = new Set<string>([
	RawBlockKind.Math,
	RawBlockKind.Mermaid,
	RawBlockKind.Paragraph,
	RawBlockKind.Quote,
	RawBlockKind.Callout,
	RawBlockKind.Code,
]);

export const AtlasInspector: React.FC<AtlasInspectorProps> = ({
	block,
	blocks,
	config,
	host,
	sourcePath,
	inTray,
	onAddToTray,
	onCopyLink,
	onRunQuickAction,
}) => {
	const inspectorRef = useRef<HTMLDivElement>(null);
	const elementContext = useMemo(
		() => block ? buildAtlasElementContext(blocks, block.id) : null,
		[block, blocks],
	);
	useRovingComposite(inspectorRef, {
		itemSelector: 'button:not([disabled]), [tabindex="0"]',
		orientation: 'vertical',
		pageSize: 6,
	});
	if (!block) {
		return (
			<div ref={inspectorRef} className="pkfa-inspector-surface">
				<section className="pkfa-inspector-empty" tabIndex={-1}>
					<span className="pkfa-selected-sub">{config.strings.inspectorEmpty}</span>
				</section>
			</div>
		);
	}

	const cardPolicy = inspectorCardPolicy(block);
	const keywordText = analysisText(block);

	return (
		<div ref={inspectorRef} className="pkfa-inspector-surface">
			<section className="pkfa-inspector-primary">
				<SourcePreview block={block} config={config} host={host} sourcePath={sourcePath} />
				<div className="pkfa-inspector-actions" aria-label="Block actions">
					<Button
						variant="unstyled"
						type="button"
						className={`pkfa-ghost-btn${inTray ? ' is-in-tray' : ''}`}
						onClick={() => onAddToTray(block)}
					>
						<Plus />
						{config.strings.addToTray}
					</Button>
					<Button variant="unstyled" type="button" className="pkfa-ghost-btn" onClick={() => onCopyLink(block)}>
						<LinkIcon />
						{config.strings.copyLink}
					</Button>
				</div>
			</section>

			<AtlasQuickActions
				block={block}
				config={config}
				host={host}
				sourcePath={sourcePath}
				onRun={onRunQuickAction}
			/>

			<AtlasReviewSuggestions
				block={block}
				config={config}
				context={elementContext}
				host={host}
				sourcePath={sourcePath}
			/>
			{cardPolicy.keywords && <KeywordSection text={keywordText} config={config} />}
			{cardPolicy.statistics && <FactsSection block={block} config={config} />}
			<AIGraphContextArtifacts
				contextRefs={[sourcePath]}
				label={config.strings.relatedAIGraphs}
				limit={1}
				className="pkfa-inspector-section pkfa-ai-graph-summary"
			/>
		</div>
	);
};

const AtlasQuickActions: React.FC<{
	block: DocumentBlock;
	config: FileAtlasConfig;
	host: FileAtlasHostPort;
	sourcePath: string;
	onRun: (block: DocumentBlock, capabilityId: ComposerCapabilityId) => void;
}> = ({ block, config, host, sourcePath, onRun }) => {
	const [snapshot, setSnapshot] = useState<{
		status: 'loading' | 'ready' | 'unavailable';
		actions: AtlasQuickAction[];
	}>(() => ({
		status: host.loadQuickActions ? 'loading' : 'unavailable',
		actions: [],
	}));
	useEffect(() => {
		let active = true;
		if (!host.loadQuickActions) {
			setSnapshot({ status: 'unavailable', actions: [] });
			return () => {
				active = false;
			};
		}
		setSnapshot({ status: 'loading', actions: [] });
		void host.loadQuickActions(sourcePath, {
			line: Math.max(0, block.anchor.lineStart - 1),
			from: block.anchor.sourceFrom,
			to: block.anchor.sourceTo,
			text: block.source,
		}).then((next) => {
			if (active) setSnapshot(next);
		}).catch(() => {
			if (active) setSnapshot({ status: 'unavailable', actions: [] });
		});
		return () => {
			active = false;
		};
	}, [block, host, sourcePath]);
	const visibleActions = useMemo(
		() => filterAtlasQuickActions(snapshot.actions, block.kind),
		[block.kind, snapshot.actions],
	);

	if (snapshot.status !== 'ready' || visibleActions.length === 0) return null;
	return (
		<section className="pkfa-inspector-section pkfa-quick-actions">
			<div className="pkfa-section-heading">
				<span className="pkfa-selected-kind">
					<WandSparkles />
					<span>{config.strings.quickActionsTitle}</span>
				</span>
			</div>
			<div className="pkfa-quick-action-list">
				{visibleActions.slice(0, 5).map((action) => (
					<Button
						key={action.capabilityId}
						variant="unstyled"
						type="button"
						className="pkfa-quick-action"
						disabled={Boolean(action.disabledReason)}
						title={action.disabledReason ?? action.description ?? action.title}
						onClick={() => onRun(block, action.capabilityId)}
					>
						<Sparkles aria-hidden />
						<span>{action.title}</span>
					</Button>
				))}
			</div>
		</section>
	);
};

const AtlasReviewSuggestions: React.FC<{
	block: DocumentBlock;
	config: FileAtlasConfig;
	context: AtlasElementContext | null;
	host: FileAtlasHostPort;
	sourcePath: string;
}> = ({ block, config, context, host, sourcePath }) => {
	const [snapshot, setSnapshot] = useState<{
		status: 'loading' | 'ready' | 'unavailable' | 'error';
		suggestions: AtlasCopilotSuggestion[];
	}>(() => ({
		status: host.loadCopilotSuggestions ? 'loading' : 'unavailable',
		suggestions: [],
	}));
	useEffect(() => {
		let active = true;
		if (!host.loadCopilotSuggestions) {
			setSnapshot({ status: 'unavailable', suggestions: [] });
			return () => {
				active = false;
			};
		}
		setSnapshot({ status: 'loading', suggestions: [] });
		void host.loadCopilotSuggestions(sourcePath)
			.then((next: AtlasCopilotSuggestionSnapshot) => {
				if (!active) return;
				setSnapshot({
					status: next.status,
					suggestions: next.suggestions,
				});
			})
			.catch(() => {
				if (active) setSnapshot({ status: 'error', suggestions: [] });
			});
		return () => {
			active = false;
		};
	}, [host, sourcePath]);
	const groups = useMemo(
		() => groupAtlasCopilotSuggestions(snapshot.suggestions, block, context?.section ?? null),
		[block, context?.section, snapshot.suggestions],
	);
	const visibleSelection = groups.selection;
	const openFinding = (suggestion: AtlasCopilotSuggestion): void => {
		host.openCopilot?.(sourcePath, {
			...(suggestion.targetBlockId ? { blockId: suggestion.targetBlockId } : {}),
			findingId: suggestion.findingId,
			...(suggestion.targetFrom !== null ? { sourceFrom: suggestion.targetFrom } : {}),
			...(suggestion.targetTo !== null ? { sourceTo: suggestion.targetTo } : {}),
		});
	};

	if (snapshot.status !== 'ready') return null;
	if (visibleSelection.length === 0) return null;
	return (
		<section className="pkfa-inspector-section pkfa-review-suggestions">
			<div className="pkfa-section-heading">
				<span className="pkfa-selected-kind">
					<Sparkles />
					<span>{config.strings.reviewSuggestionsTitle}</span>
				</span>
				<span className="pkfa-section-count">{visibleSelection.length}</span>
			</div>
			{visibleSelection.map((suggestion) => (
				<Button
					key={suggestion.findingId}
					variant="unstyled"
					type="button"
					className={`pkfa-review-suggestion${suggestion.state === 'stale' ? ' is-stale' : ''}`}
					onClick={() => openFinding(suggestion)}
				>
					<span>
						<strong>{suggestion.title}</strong>
						{suggestion.summary && <small>{suggestion.summary}</small>}
					</span>
					<ExternalLink aria-hidden />
				</Button>
			))}
		</section>
	);
};

/** A copy-to-clipboard button with a transient "Copied" state. */
const CopyButton: React.FC<{
	onCopy: () => void | Promise<void>;
	config: FileAtlasConfig;
	label?: string;
	icon?: React.ReactNode;
}> = ({ onCopy, config, label, icon }) => {
	const [copied, setCopied] = useState(false);
	const timer = useRef<number | null>(null);
	useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); }, []);
	const handle = async (): Promise<void> => {
		await onCopy();
		setCopied(true);
		if (timer.current) window.clearTimeout(timer.current);
		timer.current = window.setTimeout(() => setCopied(false), 1200);
	};
	return (
		<Button
			variant="unstyled"
			type="button"
			className={`pkfa-copy-btn${copied ? ' is-copied' : ''}`}
			onClick={handle}
		>
			{copied ? <Check /> : icon ?? <Copy />}
			{copied ? config.strings.copiedLabel : label ?? config.strings.copyLabel}
		</Button>
	);
};

/** Wrapper that shows a hover toolbar (extra actions + Copy) over any preview. */
const CopyablePreview: React.FC<{
	config: FileAtlasConfig;
	host: FileAtlasHostPort;
	copyText: string;
	copyMessage: string;
	extra?: React.ReactNode;
	children: React.ReactNode;
}> = ({ config, host, copyText, copyMessage, extra, children }) => (
	<div className="pkfa-preview-wrap">
		<div className="pkfa-preview-toolbar">
			{extra}
			<CopyButton
				config={config}
				onCopy={() => {
					void host.copyToClipboard(copyText);
					host.notify(copyMessage);
				}}
			/>
		</div>
		{children}
	</div>
);

/**
 * Strip the common leading indentation shared by all non-blank lines. A block
 * lifted out of a nested list / task keeps its original indent, and 4+ leading
 * spaces make Markdown parse it as a code block — dedenting restores the intended
 * list / task / prose rendering. No-op when the block already starts at column 0.
 */
function dedent(source: string): string {
	const lines = source.split('\n');
	const indents = lines.filter((l) => l.trim()).map((l) => (l.match(/^\s*/)?.[0].length ?? 0));
	const min = indents.length ? Math.min(...indents) : 0;
	return min ? lines.map((l) => l.slice(min)).join('\n') : source;
}

/** Real Markdown rendering for renderable blocks (prose / lists / tasks / code / math / mermaid). */
const RenderedPreview: React.FC<{ source: string }> = ({ source }) => (
	<div className="pkfa-preview-render" tabIndex={0} aria-label="Block preview">
		<StreamdownIsolated>{dedent(source)}</StreamdownIsolated>
	</div>
);

/** Compact structural preview for headings and lists; every content unit stays on one line. */
const StructuredPreview: React.FC<{
	block: DocumentBlock;
	config: FileAtlasConfig;
}> = ({ block, config }) => {
	const rows = compactStructuredPreviewRows(block);
	return (
		<div className="pkfa-structured-preview" tabIndex={0} aria-label="Section preview">
			<div className="pkfa-structured-preview-list" role="list">
				{rows.map(({ block: row, depth }) => {
					const RowIcon = iconForKind(row.kind, row.level);
					const rowIdentity = displayIdentity(row, config);
					return (
						<div
							className="pkfa-structured-preview-row"
							role="listitem"
							key={row.id}
							style={{ '--pkfa-preview-depth': depth } as CSSProperties}
						>
							<RowIcon aria-hidden />
							<span>{rowIdentity.primary}</span>
						</div>
					);
				})}
			</div>
		</div>
	);
};

function humanBytes(bytes: number | null): string {
	if (bytes === null) return '—';
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Inline image preview with dimensions / format / size + copy-image. */
const ImagePreview: React.FC<{
	block: DocumentBlock;
	config: FileAtlasConfig;
	host: FileAtlasHostPort;
	sourcePath: string;
}> = ({ block, config, host, sourcePath }) => {
	const target = block.detail?.fileTarget ?? block.title;
	const identity = displayIdentity(block, config);
	const [info, setInfo] = useState<AtlasImageInfo | null>(null);
	const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
	const [failed, setFailed] = useState(false);

	useEffect(() => {
		let alive = true;
		setInfo(null);
		setDims(null);
		setFailed(false);
		if (!host.resolveImage) return;
		host.resolveImage(target, sourcePath)
			.then((res) => { if (alive) { if (res) setInfo(res); else setFailed(true); } })
			.catch(() => { if (alive) setFailed(true); });
		return () => { alive = false; };
	}, [target, sourcePath, host]);

	// No resolver, or unresolved: fall back to a copyable media card.
	if (!host.resolveImage || failed) {
		const FallbackIcon = iconForKind(RawBlockKind.Image);
		return (
			<CopyablePreview config={config} host={host} copyText={block.source} copyMessage="Ref copied">
				<div className="pkfa-preview-media">
					<FallbackIcon />
					<div>
						<div className="pkfa-preview-title">{identity.primary}</div>
						<div className="pkfa-preview-sub">{identity.secondary ?? target}</div>
					</div>
				</div>
			</CopyablePreview>
		);
	}

	const extra = (
		<>
			<Button
				variant="unstyled"
				type="button"
				className="pkfa-copy-btn"
				onClick={() => host.openLink(target, sourcePath, false)}
			>
				<Eye />
				{config.strings.openTarget}
			</Button>
			{host.copyImage && (
				<CopyButton
					config={config}
					label="Copy image"
					icon={<Copy />}
					onCopy={async () => {
						await host.copyImage!(target, sourcePath);
						host.notify('Image copied');
					}}
				/>
			)}
		</>
	);

	return (
		<CopyablePreview config={config} host={host} copyText={block.source} copyMessage="Markdown ref copied" extra={extra}>
			<div className="pkfa-preview-image">
				<div className="pkfa-preview-image-frame">
					{info && (
						<img
							src={info.src}
							alt={target}
							onLoad={(e) => setDims({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
						/>
					)}
				</div>
				<div className="pkfa-preview-image-meta">
					<span className="pkfa-preview-image-identity" title={identity.primary}>{identity.primary}</span>
					<span className="pkfa-dim-chip pkfa-mono">{dims ? `${dims.w} × ${dims.h}` : '…'}</span>
					{info && <span className="pkfa-dim-chip">{info.format}</span>}
					{info && <span className="pkfa-dim-chip">{humanBytes(info.sizeBytes)}</span>}
				</div>
			</div>
		</CopyablePreview>
	);
};

const CompactLinkPreview: React.FC<{
	primary: string;
	secondary?: string;
	target: string;
	external: boolean;
	host: FileAtlasHostPort;
	sourcePath: string;
}> = ({ primary, secondary, target, external, host, sourcePath }) => {
	const normalizedPrimary = cleanInlineMarkdown(primary).trim();
	const normalizedSecondary = cleanInlineMarkdown(secondary ?? '').trim();
	const normalizedTarget = target.trim();
	const showSecondary = normalizedSecondary
		&& normalizedSecondary.toLocaleLowerCase() !== normalizedPrimary.toLocaleLowerCase();
	const showTarget = normalizedTarget.toLocaleLowerCase() !== normalizedPrimary.toLocaleLowerCase()
		&& normalizedTarget.toLocaleLowerCase() !== normalizedSecondary.toLocaleLowerCase();
	return (
		<div className="pkfa-compact-link-preview">
			<strong>{normalizedPrimary || target}</strong>
			<Button
				variant="unstyled"
				type="button"
				className="pkfa-compact-link-open"
				title={`Open ${target}`}
				aria-label={`Open ${target}`}
				onClick={() => host.openLink(target, sourcePath, external)}
			>
				<ExternalLink aria-hidden />
			</Button>
			{showSecondary && <span className="pkfa-compact-link-secondary">{normalizedSecondary}</span>}
			{showTarget && <span className="pkfa-compact-link-target">{normalizedTarget}</span>}
		</div>
	);
};

/** Program-computed term-frequency keywords for every addressable block. */
const KeywordSection: React.FC<{ text: string; config: FileAtlasConfig }> = ({ text, config }) => {
	const [expanded, setExpanded] = useState(false);
	const keywords = keywordsOf(text, config.keywordStopwords);
	const visibleKeywords = expanded ? keywords : keywords.slice(0, 5);
	const max = keywords[0]?.[1] ?? 1;
	return (
		<section className="pkfa-inspector-section pkfa-keyword-section">
			<div className="pkfa-section-heading">
				<span className="pkfa-selected-kind">
					<Hash />
					<span>{config.strings.keywordsTitle}</span>
				</span>
				{keywords.length > 5 && (
					<Button
						variant="unstyled"
						type="button"
						className="pkfa-inline-toggle"
						onClick={() => setExpanded((current) => !current)}
						aria-expanded={expanded}
					>
						{expanded ? config.strings.keywordsShowLess : config.strings.keywordsShowAll}
					</Button>
				)}
			</div>
			{keywords.length ? (
				<div className="pkfa-kw-list" role="list">
					{visibleKeywords.map(([word, count]) => (
						<div key={word} className="pkfa-kw-row" role="listitem">
							<span className="pkfa-kw-word">{word}</span>
							<span className="pkfa-kw-meter" aria-hidden="true">
								<span style={{ width: `${Math.max(12, (count / max) * 100)}%` }} />
							</span>
							<span className="pkfa-kw-count">{count}</span>
						</div>
					))}
				</div>
			) : (
				<span className="pkfa-selected-sub">{config.strings.keywordsEmpty}</span>
			)}
		</section>
	);
};

const FactsSection: React.FC<{ block: DocumentBlock; config: FileAtlasConfig }> = ({
	block,
	config,
}) => {
	const stats = statisticsOf(block);
	const s = config.strings;
	let rows: Array<[string, string | number | undefined]>;
	if (block.kind === RawBlockKind.Heading) {
		rows = [
			[s.statParagraphs, stats.paragraphs],
			[s.statResources, stats.resources],
		];
	} else if (block.kind === RawBlockKind.List) {
		rows = [
			[s.statItems, stats.items],
			[s.statNestedLists, stats.nestedLists],
			[s.statTasks, stats.tasks],
			[s.statChecked, stats.checked],
			[s.statUnchecked, stats.unchecked],
		];
	} else if (block.kind === RawBlockKind.Task) {
		rows = [[s.statStatus, stats.status]];
	} else if (block.kind === RawBlockKind.Table) {
		rows = [
			[s.statRows, stats.rows],
			[s.statColumns, stats.columns],
		];
	} else if (block.kind === RawBlockKind.Code || block.kind === RawBlockKind.Mermaid) {
		rows = [
			[s.statCodeLines, stats.codeLines],
			[s.statLanguage, stats.language],
		];
	} else if (block.kind === RawBlockKind.Callout) {
		rows = [
			[s.statParagraphs, stats.paragraphs],
			[s.statResources, stats.resources],
		];
	} else {
		rows = [
			[s.statWords, stats.words],
			[s.statCharacters, stats.characters],
		];
	}
	const visibleRows = rows.filter(([, value]) => value !== undefined);
	if (visibleRows.length === 0) return null;
	return (
		<section className="pkfa-inspector-section pkfa-facts-section">
			<span className="pkfa-selected-kind">
				<BarChart3 />
				<span>{s.statisticsTitle}</span>
			</span>
			<div className="pkfa-meta-rows">
				{visibleRows.map(([label, value]) => (
					<div className="pkfa-meta-row" key={label}>
						<span className="pkfa-k">{label}</span>
						<span className="pkfa-v pkfa-mono">{value}</span>
					</div>
				))}
			</div>
		</section>
	);
};

/** Specialized, copyable preview per kind. */
const SourcePreview: React.FC<{
	block: DocumentBlock;
	config: FileAtlasConfig;
	host: FileAtlasHostPort;
	sourcePath: string;
}> = ({ block, config, host, sourcePath }) => {
	const { kind, detail } = block;
	const identity = displayIdentity(block, config);

	if (kind === RawBlockKind.Frontmatter) {
		return (
			<div className="pkfa-typed-summary">
				{(block.children ?? [])
					.filter((child) => child.kind === RawBlockKind.Property)
					.slice(0, 8)
					.map((child) => {
						const property = displayIdentity(child, config);
						return (
							<div className="pkfa-meta-row" key={child.id}>
								<span className="pkfa-k">{property.primary}</span>
								<span className="pkfa-v">{property.secondary || '—'}</span>
							</div>
						);
					})}
			</div>
		);
	}

	if (kind === RawBlockKind.Property) {
		return (
			<div className="pkfa-object-value">
				<span className="pkfa-preview-title">{identity.primary}</span>
				<span className="pkfa-v">{identity.secondary || '—'}</span>
			</div>
		);
	}

	if (kind === RawBlockKind.Tag) {
		return (
			<div className="pkfa-object-value">
				<span className="pkfa-preview-title">{identity.primary}</span>
				<span className="pkfa-k">{config.strings.occurrencesLabel}</span>
				<span className="pkfa-v pkfa-mono">{detail?.occurrenceCount ?? 1}</span>
			</div>
		);
	}

	if (kind === RawBlockKind.Heading) {
		return (
			<CopyablePreview
				config={config}
				host={host}
				copyText={sectionText(block)}
				copyMessage="Section copied"
			>
				<StructuredPreview block={block} config={config} />
			</CopyablePreview>
		);
	}

	if (
		kind === RawBlockKind.List
		|| kind === RawBlockKind.ListItem
		|| kind === RawBlockKind.Task
	) {
		return (
			<CopyablePreview
				config={config}
				host={host}
				copyText={block.source}
				copyMessage="List copied"
			>
				<StructuredPreview block={block} config={config} />
			</CopyablePreview>
		);
	}

	if (kind === RawBlockKind.Footnote) {
		const definition = detail?.definitionText ?? block.source;
		return (
			<CopyablePreview
				config={config}
				host={host}
				copyText={definition}
				copyMessage="Footnote copied"
			>
				<RenderedPreview source={definition} />
			</CopyablePreview>
		);
	}

	if (kind === RawBlockKind.Image) {
		return <ImagePreview block={block} config={config} host={host} sourcePath={sourcePath} />;
	}

	if (kind === RawBlockKind.Embed || kind === RawBlockKind.Attachment) {
		const MediaIcon = iconForKind(kind);
		return (
			<CopyablePreview config={config} host={host} copyText={block.source} copyMessage="Ref copied">
				<Button
					variant="unstyled"
					type="button"
					className="pkfa-preview-link is-clickable"
					onClick={() => host.openLink(
						detail?.target ?? detail?.fileTarget ?? block.title,
						sourcePath,
						false,
					)}
				>
					<MediaIcon />
					<div>
						<div className="pkfa-preview-title">{identity.primary}</div>
						<div className="pkfa-preview-sub">{identity.secondary ?? detail?.fileTarget}</div>
					</div>
				</Button>
			</CopyablePreview>
		);
	}

	if (kind === RawBlockKind.VaultLink || kind === RawBlockKind.ExternalLink) {
		const isExternal = kind === RawBlockKind.ExternalLink;
		const target = detail?.target ?? block.source;
		return (
			<CopyablePreview
				config={config}
				host={host}
				copyText={target}
				copyMessage={isExternal ? 'URL copied' : 'Link copied'}
			>
				<CompactLinkPreview
					primary={identity.primary}
					secondary={identity.secondary}
					target={target}
					external={isExternal}
					host={host}
					sourcePath={sourcePath}
				/>
			</CopyablePreview>
		);
	}

	if (kind === RawBlockKind.Table) {
		return (
			<CopyablePreview config={config} host={host} copyText={block.source} copyMessage="Table copied">
				<PreviewTable source={block.source} />
			</CopyablePreview>
		);
	}

	// Prose, lists, tasks, callouts, fenced code, diagrams, and formulas all render
	// as real Markdown so bold / bullets / checkboxes / highlighting show instead of
	// raw `**`, `- [ ]`, and ``` markers.
	if (RENDERED_KINDS.has(kind)) {
		return (
			<CopyablePreview config={config} host={host} copyText={block.source} copyMessage="Copied to clipboard">
				<RenderedPreview source={block.source} />
			</CopyablePreview>
		);
	}

	// Heading, frontmatter group, property / tag rows, footnote defs, and any
	// default: a plain mono snippet (their raw text is already the clean read).
	const text = block.source;
	return (
		<CopyablePreview config={config} host={host} copyText={text} copyMessage="Copied to clipboard">
			<div className="pkfa-source-snippet">{text}</div>
		</CopyablePreview>
	);
};

/** Render the first rows of a Markdown table source into a lightweight HTML table. */
const PreviewTable: React.FC<{ source: string }> = ({ source }) => {
	const rows = source
		.split(/\r?\n/)
		.map((l) => l.trim())
		.filter((l) => l.startsWith('|'))
		.filter((l) => !/^\|[\s|:-]+\|?$/.test(l))
		.map((l) => l.replace(/^\||\|$/g, '').split('|').map((c) => c.trim()));
	if (!rows.length) return <div className="pkfa-source-snippet">{source}</div>;
	const [head, ...body] = rows;
	return (
		<div className="pkfa-preview-table-scroll" tabIndex={0} aria-label="Table preview">
			<table className="pkfa-preview-table">
				<thead>
					<tr>{head.map((c, i) => <th key={i}>{c}</th>)}</tr>
				</thead>
				<tbody>
					{body.slice(0, 8).map((r, ri) => (
						<tr key={ri}>{r.map((c, ci) => <td key={ci}>{c}</td>)}</tr>
					))}
				</tbody>
			</table>
		</div>
	);
};
