/**
 * File Atlas — Inspector (Phase 1).
 *
 * Right pane detail for the selected node. Every preview is copyable (hover
 * toolbar → Copy). Renderable blocks (mermaid / math / tables / code / prose)
 * render for real through the shared StreamdownIsolated renderer — no raw source
 * dumps, no vendored libs. Images preview inline with dimensions / format / size
 * and a Copy-image action. Paragraphs get a program-computed term-frequency
 * keyword card. Insight / anchor provenance cards remain Phase 2.
 */

import React, { useEffect, useRef, useState } from 'react';
import { BarChart3, Eye, Plus, Link as LinkIcon, FileText, Send, Copy, Check, Hash } from 'lucide-react';
import type { DocumentBlock } from '@/core/document/atlas/types';
import { RawBlockKind } from '@/core/document/atlas/types';
import { Button } from '@/ui/component/shared-ui/button';
import { StreamdownIsolated } from '@/ui/component/mine';
import type { FileAtlasConfig } from '../config/fileAtlasConfig';
import type { AtlasImageInfo, FileAtlasHostPort } from '../FileAtlasHostPort';
import { iconForKind } from '../config/kindIcons';
import { analysisText, isGroupNode, keywordsOf, statisticsOf } from '../atlasTreeModel';

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

/**
 * Kinds whose `title` is a genuine label (heading text, file name, link text) and
 * worth showing above the preview. Everything else derives its title from its own
 * content (first line, `key: value`, `#tag`), so showing it would just repeat the
 * preview — those blocks show the kind + content preview only.
 */
const TITLE_IS_LABEL = new Set<string>([
	RawBlockKind.Heading,
	RawBlockKind.Frontmatter,
	RawBlockKind.VaultLink,
	RawBlockKind.ExternalLink,
	RawBlockKind.Image,
	RawBlockKind.Embed,
	RawBlockKind.Attachment,
]);

/**
 * Kinds whose `sub` carries real data (a count, status, or type) worth showing
 * under the kind label. Every other kind's sub just restates the kind itself
 * ("Body paragraph" under PARAGRAPH, "Vault link" under VAULT LINK), so it's
 * dropped as noise.
 */
const SUB_IS_INFORMATIVE = new Set<string>([
	RawBlockKind.Frontmatter, // "N properties"
	RawBlockKind.List, // "N items"
	RawBlockKind.Task, // "Checked" / "Unchecked"
	RawBlockKind.Code, // "N lines"
	RawBlockKind.Table, // "N rows · M columns"
	RawBlockKind.Callout, // "<type> callout"
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
	if (!block) {
		return (
			<section className="pkfa-card">
				<div className="pkfa-card-body">
					<span className="pkfa-selected-sub">{config.strings.inspectorEmpty}</span>
				</div>
			</section>
		);
	}

	const kindCfg = config.kinds[block.kind];
	const Icon = iconForKind(block.kind);
	const isGroup = isGroupNode(block);
	const label =
		block.kind === RawBlockKind.Heading
			? `Heading H${block.level}`
			: block.kind === RawBlockKind.Frontmatter
				? config.strings.frontmatterTitle
				: kindCfg?.label ?? block.kind;
	const isHeading = block.kind === RawBlockKind.Heading;
	const keywordText = analysisText(block);
	// Content blocks (paragraph / list / quote / …) title themselves off their own
	// first line, so the preview already shows it — only render the title span when
	// it's a real, distinct label.
	const showTitle = TITLE_IS_LABEL.has(block.kind);
	// Only show the sub when it adds a count / status / type; otherwise it just
	// restates the kind label above it ("Body paragraph" under PARAGRAPH).
	const showSub = !!block.sub && SUB_IS_INFORMATIVE.has(block.kind);

	return (
		<>
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
					{showTitle && <span className="pkfa-selected-title">{block.title}</span>}
					{showSub && <span className="pkfa-selected-sub">{block.sub}</span>}
					{/* Headings already show their full text as the title above — a mono
					    "# heading" preview would just repeat it, so skip it here. */}
					{!isHeading && <SourcePreview block={block} config={config} host={host} sourcePath={sourcePath} />}
				</div>
			</section>

			<KeywordCard text={keywordText} config={config} />

			<StatisticsCard block={block} config={config} />

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
		</>
	);
};

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
	<div className="pkfa-preview-render">
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
						<div className="pkfa-preview-title">{target}</div>
						<div className="pkfa-preview-sub">{block.sub ?? block.source}</div>
					</div>
				</div>
			</CopyablePreview>
		);
	}

	const extra = host.copyImage ? (
		<CopyButton
			config={config}
			label="Copy image"
			icon={<Copy />}
			onCopy={async () => {
				await host.copyImage!(target, sourcePath);
				host.notify('Image copied');
			}}
		/>
	) : undefined;

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
	const [expanded, setExpanded] = useState(false);
	const keywords = keywordsOf(text, config.keywordStopwords);
	useEffect(() => setExpanded(false), [text]);
	// keywordsOf returns counts descending, so the first entry is the max. Size each
	// chip by a linear weight (count / max, floored so the rarest term stays legible)
	// — frequency should read directly by size. CSS maps `--kw-w` to font + badge.
	const max = keywords[0]?.[1] ?? 1;
	const visibleKeywords = expanded ? keywords : keywords.slice(0, 4);
	return (
		<section className="pkfa-card">
			<div className="pkfa-card-body">
				<span className="pkfa-selected-kind">
					<Hash />
					<span>{config.strings.keywordsTitle}</span>
				</span>
				{keywords.length ? (
					<>
						<div className={`pkfa-kw-list${expanded ? ' is-expanded' : ''}`}>
							{visibleKeywords.map(([word, count]) => (
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
						{keywords.length > 4 && (
							<Button
								variant="unstyled"
								type="button"
								className="pkfa-kw-toggle"
								aria-expanded={expanded}
								onClick={() => setExpanded((current) => !current)}
							>
								{expanded
									? config.strings.keywordsShowLess
									: config.strings.keywordsShowAll.replace('{count}', String(keywords.length))}
							</Button>
						)}
					</>
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
	const rows: Array<[string, string | number | undefined]> = [
		[s.statWords, stats.words],
		[s.statCharacters, stats.characters],
		[s.statLines, stats.lines],
		[s.statItems, stats.items],
		[s.statTasks, stats.tasks],
		[s.statChecked, stats.checked],
		[s.statUnchecked, stats.unchecked],
		[s.statRows, stats.rows],
		[s.statColumns, stats.columns],
		[s.statCodeLines, stats.codeLines],
		[s.statLanguage, stats.language],
		[s.statStatus, stats.status],
	];
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

/** Specialized, copyable preview per kind. */
const SourcePreview: React.FC<{
	block: DocumentBlock;
	config: FileAtlasConfig;
	host: FileAtlasHostPort;
	sourcePath: string;
}> = ({ block, config, host, sourcePath }) => {
	const { kind, detail } = block;

	if (kind === RawBlockKind.Image) {
		return <ImagePreview block={block} config={config} host={host} sourcePath={sourcePath} />;
	}

	if (kind === RawBlockKind.Embed || kind === RawBlockKind.Attachment) {
		const MediaIcon = iconForKind(kind);
		return (
			<CopyablePreview config={config} host={host} copyText={block.source} copyMessage="Ref copied">
				<div className="pkfa-preview-media">
					<MediaIcon />
					<div>
						<div className="pkfa-preview-title">{detail?.fileTarget ?? block.title}</div>
						<div className="pkfa-preview-sub">{block.sub ?? block.source}</div>
					</div>
				</div>
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
						<div className="pkfa-preview-title">{block.title}</div>
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
	const text = kind === RawBlockKind.Heading ? `${'#'.repeat(block.level ?? 1)} ${block.title}` : block.source;
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
		<div style={{ overflowX: 'auto' }}>
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
