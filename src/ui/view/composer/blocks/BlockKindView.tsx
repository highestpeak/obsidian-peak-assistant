import * as React from 'react';
import type { ComposerBlock } from '@/core/composer';

/**
 * Read-only, kind-dispatched block renderer (WP1 skeleton).
 *
 * Every branch renders from the verbatim `renderModel.raw` slice plus the cheap
 * structural hints — no re-parsing, no editing affordances (block editing +
 * action row are WP4). Unknown / unsupported kinds fall through to a verbatim
 * `<pre>` so nothing is ever hidden or dropped. Semantic h1-h6/p tags are
 * avoided per project convention (span/div/pre only).
 */
export function BlockKindView({ block }: { block: ComposerBlock }): React.ReactElement {
	switch (block.kind) {
		case 'heading':
			return <HeadingView block={block} />;
		case 'divider':
			return <div className="pk-composer-divider" role="separator" />;
		case 'list':
		case 'task':
			return <ListView block={block} />;
		case 'image':
		case 'embed':
			return <RefView block={block} />;
		case 'code':
		case 'math':
		case 'mermaid':
		case 'dataview':
		case 'html':
		case 'frontmatter':
		case 'table':
		case 'comment':
		case 'unknown':
			return <MonoView block={block} />;
		default:
			return <ProseView block={block} />;
	}
}

function HeadingView({ block }: { block: ComposerBlock }): React.ReactElement {
	const level = block.renderModel.level ?? 1;
	return (
		<span className="pk-composer-heading" data-level={level}>
			{block.renderModel.text || block.renderModel.raw}
		</span>
	);
}

function ProseView({ block }: { block: ComposerBlock }): React.ReactElement {
	return <div className="pk-composer-prose">{block.renderModel.raw}</div>;
}

function MonoView({ block }: { block: ComposerBlock }): React.ReactElement {
	return <pre className="pk-composer-mono">{block.renderModel.raw}</pre>;
}

function ListView({ block }: { block: ComposerBlock }): React.ReactElement {
	const lines = block.renderModel.raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
	return (
		<div className="pk-composer-list">
			{lines.map((line, i) => (
				<span key={i} className="pk-composer-list__item">
					{line}
				</span>
			))}
		</div>
	);
}

function RefView({ block }: { block: ComposerBlock }): React.ReactElement {
	return <span className="pk-composer-ref">{block.renderModel.raw}</span>;
}
