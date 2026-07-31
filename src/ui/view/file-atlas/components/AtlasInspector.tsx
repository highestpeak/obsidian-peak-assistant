/**
 * File Atlas — Inspector (Phase 1).
 *
 * Right pane detail for the selected node. Every preview is copyable (hover
 * toolbar → Copy). Renderable blocks (mermaid / math / tables / code / prose)
 * render for real through the shared StreamdownIsolated renderer — no raw source
 * dumps, no vendored libs. Images preview inline with dimensions / format / size
 * and a Copy-image action. Paragraphs get a program-computed term-frequency
 * keyword card. Long preview and keyword content stay bounded inside their own
 * scroll regions while the full Inspector column scrolls independently.
 * Insight / anchor provenance cards remain Phase 2.
 */

import React, { useEffect, useRef, useState } from 'react';
import { BarChart3, Eye, Plus, Link as LinkIcon, FileText, Send, Copy, Check, Hash, Sparkles } from 'lucide-react';
import type { DocumentBlock } from '@/core/document/atlas/types';
import { RawBlockKind } from '@/core/document/atlas/types';
import { Button } from '@/ui/component/shared-ui/button';
import { StreamdownIsolated } from '@/ui/component/mine';
import type { FileAtlasConfig } from '../config/fileAtlasConfig';
import type {
	AtlasCopilotSuggestion,
	AtlasImageInfo,
	FileAtlasHostPort,
} from '../FileAtlasHostPort';
import { iconForKind } from '../config/kindIcons';
import {
	analysisText,
	isGroupNode,
	keywordsOf,
	sectionText,
	statisticsOf,
} from '../atlasTreeModel';
import {
	displayIdentity,
	inspectorCardPolicy,
} from '../atlasDisplayModel';
import { AIGraphContextArtifacts } from '@/ui/component/ai-graph';
import { useRovingComposite } from '@/ui/keyboard/useRovingComposite';

interface AtlasInspectorProps {
	block: DocumentBlock | null;
	config: FileAtlasConfig;
	host: FileAtlasHostPort;
	sourcePath: string;
	inTray: boolean;
	onReveal: (block: DocumentBlock) => void;
	onAddToTray: (block: DocumentBlock) => void;
	onCopyLink: (block: DocumentBlock) => void;
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
	RawBlockKind.List,
	RawBlockKind.ListItem,
	RawBlockKind.Task,
	RawBlockKind.Quote,
	RawBlockKind.Callout,
	RawBlockKind.Code,
]);

export const AtlasInspector: React.FC<AtlasInspectorProps> = ({
	block,
	config,
	host,
	sourcePath,
	inTray,
	onReveal,
	onAddToTray,
	onCopyLink,
}) => {
	const inspectorRef = useRef<HTMLDivElement>(null);
	useRovingComposite(inspectorRef, {
		itemSelector: 'button:not([disabled]), [tabindex="0"]',
		orientation: 'vertical',
		pageSize: 6,
	});
	if (!block) {
		return (
			<div ref={inspectorRef}>
				<section className="pkfa-card" tabIndex={-1}>
					<div className="pkfa-card-body">
						<span className="pkfa-selected-sub">{config.strings.inspectorEmpty}</span>
					</div>
				</section>
			</div>
		);
	}

	const kindCfg = config.kinds[block.kind];
	const Icon = iconForKind(block.kind);
	const isGroup = isGroupNode(block);
	const identity = displayIdentity(block, config);
	const cardPolicy = inspectorCardPolicy(block);
	const label =
		block.kind === RawBlockKind.Heading
			? `Heading H${block.level}`
			: block.kind === RawBlockKind.Frontmatter
				? config.strings.frontmatterTitle
				: kindCfg?.label ?? block.kind;
	const keywordText = analysisText(block);

	return (
		<div ref={inspectorRef}>
			<section className="pkfa-card">
				<div className="pkfa-card-body">
					<div className="pkfa-selected-top">
						<span className="pkfa-selected-kind">
							<Icon />
							<span>{label}</span>
						</span>
						<Button
							variant="unstyled"
							type="button"
							className="pkfa-ghost-btn"
							onClick={() => onReveal(block)}
							title={config.strings.reveal}
						>
							<Eye />
							{config.strings.reveal}
						</Button>
					</div>
					<span className="pkfa-selected-title">{identity.primary}</span>
					{identity.secondary && <span className="pkfa-selected-sub">{identity.secondary}</span>}
					<SourcePreview block={block} config={config} host={host} sourcePath={sourcePath} />
				</div>
			</section>

			{cardPolicy.keywords && <KeywordCard text={keywordText} config={config} />}

			{cardPolicy.statistics && <StatisticsCard block={block} config={config} />}

			<section className="pkfa-card">
				<div className="pkfa-card-body">
					<span className="pkfa-selected-kind">
						<FileText />
						<span>{config.strings.locationCard}</span>
					</span>
					<div className="pkfa-meta-rows">
						<div className="pkfa-meta-row">
							<span className="pkfa-k">{config.strings.lines}</span>
							<span className="pkfa-v pkfa-mono">{lineRange(block)}</span>
						</div>
						<div className="pkfa-meta-row">
							<span className="pkfa-k">{config.strings.nearestHeading}</span>
							<span className="pkfa-v">{block.anchor.nearestHeading ?? '—'}</span>
						</div>
					</div>
				</div>
			</section>

			{cardPolicy.sourceDetails && (
				<SourceDetails block={block} config={config} />
			)}

			<AtlasCopilotSuggestions
				block={block}
				config={config}
				host={host}
				sourcePath={sourcePath}
			/>

			<AIGraphContextArtifacts
				contextRefs={[sourcePath]}
				label="AI Graph artifacts"
				className="pkfa-card pk-ai-graph-context-artifacts"
			/>

			<section className="pkfa-card">
				<div className="pkfa-card-body">
					<span className="pkfa-selected-kind">
						<Send />
						<span>Use this {isGroup ? 'section' : 'block'}</span>
					</span>
					<div className="pkfa-actions">
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
				</div>
			</section>
		</div>
	);
};

const AtlasCopilotSuggestions: React.FC<{
	block: DocumentBlock;
	config: FileAtlasConfig;
	host: FileAtlasHostPort;
	sourcePath: string;
}> = ({ block, config, host, sourcePath }) => {
	const [suggestions, setSuggestions] = useState<AtlasCopilotSuggestion[]>([]);
	const [loading, setLoading] = useState(Boolean(host.loadCopilotSuggestions));
	useEffect(() => {
		let active = true;
		if (!host.loadCopilotSuggestions) {
			setLoading(false);
			setSuggestions([]);
			return () => {
				active = false;
			};
		}
		setLoading(true);
		void host.loadCopilotSuggestions(sourcePath)
			.then((next) => {
				if (!active) return;
				const range = atlasSelectionRange(block);
				setSuggestions(next.filter((suggestion) => {
					if (suggestion.targetFrom === null || suggestion.targetTo === null) return false;
					return suggestion.targetTo >= range.from && suggestion.targetFrom <= range.to;
				}).slice(0, 3));
			})
			.finally(() => {
				if (active) setLoading(false);
			});
		return () => {
			active = false;
		};
	}, [host, sourcePath]);

	return (
		<section className="pkfa-card pkfa-copilot-suggestions">
			<div className="pkfa-card-body">
				<span className="pkfa-selected-kind">
					<Sparkles />
					<span>{config.strings.copilotSuggestionsTitle}</span>
				</span>
				<span className="pkfa-selected-sub">{config.strings.sendToCopilotHint}</span>
				{loading && <span className="pkfa-selected-sub">{config.strings.copilotSuggestionsLoading}</span>}
				{!loading && suggestions.length === 0 && (
					<span className="pkfa-selected-sub">{config.strings.copilotSuggestionsEmpty}</span>
				)}
				{suggestions.map((suggestion, index) => (
					<div
						key={suggestion.findingId}
						className={`pkfa-copilot-suggestion${suggestion.state === 'stale' ? ' is-stale' : ''}`}
					>
						<span className="pkfa-suggestion-index">{String(index + 1).padStart(2, '0')}</span>
						<span className="pkfa-suggestion-copy">
							<strong>{suggestion.title}</strong>
							{suggestion.summary && <small>{suggestion.summary}</small>}
							<small>{suggestion.targetLabel} · {suggestion.evidenceLabel}</small>
						</span>
						<Button
							variant="unstyled"
							type="button"
							className="pkfa-copilot-open"
							onClick={() => host.openCopilot?.(sourcePath, {
								...(suggestion.targetBlockId
									? { blockId: suggestion.targetBlockId }
									: {}),
								findingId: suggestion.findingId,
								sourceFrom: block.anchor.sourceFrom,
								sourceTo: block.anchor.sourceTo,
							})}
						>
							{config.strings.copilotOpen}
						</Button>
					</div>
				))}
				{host.openCopilot && (
					<Button
						variant="unstyled"
						type="button"
						className="pkfa-ghost-btn"
						onClick={() => host.openCopilot?.(sourcePath, {
							sourceFrom: block.anchor.sourceFrom,
							sourceTo: block.anchor.sourceTo,
						})}
					>
						<Send />
						{config.strings.sendToCopilot}
					</Button>
				)}
			</div>
		</section>
	);
};

function atlasSelectionRange(block: DocumentBlock): { from: number; to: number } {
	let from = block.anchor.sourceFrom ?? 0;
	let to = block.anchor.sourceTo ?? from;
	const visit = (candidate: DocumentBlock): void => {
		from = Math.min(from, candidate.anchor.sourceFrom ?? from);
		to = Math.max(to, candidate.anchor.sourceTo ?? to);
		for (const child of candidate.children ?? []) visit(child);
	};
	visit(block);
	return { from, to };
}

function lineRange(block: DocumentBlock): string {
	const { lineStart, lineEnd } = block.anchor;
	return lineStart === lineEnd ? String(lineStart) : `${lineStart}–${lineEnd}`;
}

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
					<span className="pkfa-dim-chip pkfa-mono">{dims ? `${dims.w} × ${dims.h}` : '…'}</span>
					{info && <span className="pkfa-dim-chip">{info.format}</span>}
					{info && <span className="pkfa-dim-chip">{humanBytes(info.sizeBytes)}</span>}
				</div>
			</div>
		</CopyablePreview>
	);
};

/** Program-computed term-frequency keywords for every addressable block. */
const KeywordCard: React.FC<{ text: string; config: FileAtlasConfig }> = ({ text, config }) => {
	const keywords = keywordsOf(text, config.keywordStopwords);
	// keywordsOf returns counts descending, so the first entry is the max. Size each
	// chip by a linear weight (count / max, floored so the rarest term stays legible)
	// — frequency should read directly by size. CSS maps `--kw-w` to font + badge.
	const max = keywords[0]?.[1] ?? 1;
	return (
		<section className="pkfa-card">
			<div className="pkfa-card-body">
				<span className="pkfa-selected-kind">
					<Hash />
					<span>{config.strings.keywordsTitle}</span>
				</span>
				{keywords.length ? (
					<div className="pkfa-kw-list">
						{keywords.map(([word, count]) => (
							<span
								key={word}
								className="pkfa-kw-chip"
								style={{ '--kw-w': Math.max(0.12, count / max).toFixed(3) } as React.CSSProperties}
							>
								{word}
								<b>×{count}</b>
							</span>
						))}
					</div>
				) : (
					<span className="pkfa-selected-sub">{config.strings.keywordsEmpty}</span>
				)}
			</div>
		</section>
	);
};

const StatisticsCard: React.FC<{ block: DocumentBlock; config: FileAtlasConfig }> = ({
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
			[s.statLines, stats.lines],
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
			[s.statLines, stats.lines],
		];
	} else {
		rows = [
			[s.statWords, stats.words],
			[s.statCharacters, stats.characters],
			[s.statLines, stats.lines],
		];
	}
	return (
		<section className="pkfa-card">
			<div className="pkfa-card-body">
				<span className="pkfa-selected-kind">
					<BarChart3 />
					<span>{s.statisticsTitle}</span>
				</span>
				<div className="pkfa-meta-rows">
					{rows
						.filter(([, value]) => value !== undefined)
						.map(([label, value]) => (
							<div className="pkfa-meta-row" key={label}>
								<span className="pkfa-k">{label}</span>
								<span className="pkfa-v pkfa-mono">{value}</span>
							</div>
						))}
				</div>
			</div>
		</section>
	);
};

const SourceDetails: React.FC<{
	block: DocumentBlock;
	config: FileAtlasConfig;
}> = ({ block, config }) => {
	const rows: Array<[string, string | undefined]> = [
		[
			config.strings.typeLabel,
			block.detail?.propertyValueType
				? config.identity.valueTypes[block.detail.propertyValueType]
				: undefined,
		],
		[config.strings.targetLabel, block.detail?.target],
		[config.strings.pathLabel, block.detail?.fileTarget],
		[
			config.strings.ownerContextLabel,
			block.anchor.nearestHeading ?? undefined,
		],
	];
	return (
		<section className="pkfa-card pkfa-source-details-card">
			<details className="pkfa-source-details">
				<summary>{config.strings.sourceDetails}</summary>
				<div className="pkfa-card-body">
					{rows
						.filter(([, value]) => Boolean(value))
						.map(([label, value]) => (
							<div className="pkfa-meta-row" key={label}>
								<span className="pkfa-k">{label}</span>
								<span className="pkfa-v pkfa-mono">{value}</span>
							</div>
						))}
					<div className="pkfa-source-snippet">{block.source}</div>
				</div>
			</details>
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
				<span className="pkfa-k">{config.strings.valueLabel}</span>
				<span className="pkfa-v">{identity.secondary || '—'}</span>
			</div>
		);
	}

	if (kind === RawBlockKind.Tag) {
		return (
			<div className="pkfa-object-value">
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
				<RenderedPreview source={sectionText(block)} />
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
		const LinkKindIcon = iconForKind(kind);
		const isExternal = kind === RawBlockKind.ExternalLink;
		const target = detail?.target ?? block.source;
		return (
			<CopyablePreview
				config={config}
				host={host}
				copyText={target}
				copyMessage={isExternal ? 'URL copied' : 'Link copied'}
			>
				<Button
					variant="unstyled"
					type="button"
					className="pkfa-preview-link is-clickable"
					title={isExternal ? `Open ${target}` : `Open note: ${target}`}
					onClick={() => host.openLink(target, sourcePath, isExternal)}
				>
					<LinkKindIcon />
					<div>
						<div className="pkfa-preview-title">{config.strings.openTarget}</div>
						<div className="pkfa-preview-sub">{target}</div>
					</div>
				</Button>
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
