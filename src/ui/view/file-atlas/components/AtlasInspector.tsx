/**
 * File Atlas — Inspector (Phase 1).
 *
 * Right pane detail for the selected node: kind/title/sub + specialized source
 * preview (table / media / link / quote / code) + Location card (full line
 * range + nearest heading) + Reveal + Add-to-tray + Copy link. Insight/anchor
 * provenance cards are Phase 2 (no persisted insights yet).
 */

import React from 'react';
import { Eye, Plus, Link as LinkIcon, FileText, Send } from 'lucide-react';
import type { DocumentBlock } from '@/core/document/atlas/types';
import { RawBlockKind } from '@/core/document/atlas/types';
import { Button } from '@/ui/component/shared-ui/button';
import type { FileAtlasConfig } from '../config/fileAtlasConfig';
import { iconForKind } from '../config/kindIcons';

interface AtlasInspectorProps {
	block: DocumentBlock | null;
	config: FileAtlasConfig;
	inTray: boolean;
	onReveal: (block: DocumentBlock) => void;
	onAddToTray: (block: DocumentBlock) => void;
	onCopyLink: (block: DocumentBlock) => void;
}

export const AtlasInspector: React.FC<AtlasInspectorProps> = ({
	block,
	config,
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
	const label = block.kind === RawBlockKind.Heading ? `Heading H${block.level}` : kindCfg?.label ?? block.kind;
	const isHeading = block.kind === RawBlockKind.Heading;

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
					<span className="pkfa-selected-title">{block.title}</span>
					{block.sub && <span className="pkfa-selected-sub">{block.sub}</span>}
					<SourcePreview block={block} />
				</div>
			</section>

			{!isHeading && (
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
			)}

			<section className="pkfa-card">
				<div className="pkfa-card-body">
					<span className="pkfa-selected-kind">
						<Send />
						<span>Use this block</span>
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

/** Specialized preview per kind (table / media / link / quote / default code). */
const SourcePreview: React.FC<{ block: DocumentBlock }> = ({ block }) => {
	const { kind, detail } = block;

	if (
		kind === RawBlockKind.Image ||
		kind === RawBlockKind.Embed ||
		kind === RawBlockKind.Attachment
	) {
		const Icon = iconForKind(kind);
		return (
			<div className="pkfa-preview-media">
				<Icon />
				<div>
					<div className="pkfa-preview-title">{detail?.fileTarget ?? block.title}</div>
					<div className="pkfa-preview-sub">{block.sub ?? block.source}</div>
				</div>
			</div>
		);
	}

	if (kind === RawBlockKind.VaultLink || kind === RawBlockKind.ExternalLink) {
		const Icon = iconForKind(kind);
		return (
			<div className="pkfa-preview-link">
				<Icon />
				<div>
					<div className="pkfa-preview-title">{block.title}</div>
					<div className="pkfa-preview-sub">{detail?.target ?? block.source}</div>
				</div>
			</div>
		);
	}

	if (kind === RawBlockKind.Table) {
		return <PreviewTable source={block.source} />;
	}

	if (kind === RawBlockKind.Quote || kind === RawBlockKind.Callout) {
		return <div className="pkfa-preview-quote">{block.source.replace(/^>\s?/gm, '')}</div>;
	}

	return <div className="pkfa-source-snippet">{block.source}</div>;
};

/** Render the first few rows of a Markdown table source into an HTML table. */
const PreviewTable: React.FC<{ source: string }> = ({ source }) => {
	const rows = source
		.split(/\r?\n/)
		.map((l) => l.trim())
		.filter((l) => l.startsWith('|'))
		.filter((l) => !/^\|[\s|:-]+\|?$/.test(l))
		.map((l) =>
			l
				.replace(/^\||\|$/g, '')
				.split('|')
				.map((c) => c.trim())
		);
	if (!rows.length) return <div className="pkfa-source-snippet">{source}</div>;
	const [head, ...body] = rows;
	return (
		<div style={{ overflowX: 'auto' }}>
			<table className="pkfa-preview-table">
				<thead>
					<tr>
						{head.map((c, i) => (
							<th key={i}>{c}</th>
						))}
					</tr>
				</thead>
				<tbody>
					{body.slice(0, 6).map((r, ri) => (
						<tr key={ri}>
							{r.map((c, ci) => (
								<td key={ci}>{c}</td>
							))}
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
};
