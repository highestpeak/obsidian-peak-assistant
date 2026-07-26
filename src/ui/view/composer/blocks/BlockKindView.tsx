import * as React from 'react';
import type { ComposerBlock } from '@/core/composer';
import { CodeBlockView } from './code/CodeBlockView';
import { MermaidBlockView } from './mermaid/MermaidBlockView';
import { BaseBlockView } from './base/BaseBlockView';
import { CanvasBlockView } from './canvas/CanvasBlockView';
import { ExcalidrawBlockView } from './excalidraw/ExcalidrawBlockView';
import { EmbedBlockView } from './embed/EmbedBlockView';
import { TableBlockView } from './table/TableBlockView';
import { ChartBlockView, isChartBlock } from './chart/ChartBlockView';
import { ConnectedFrontmatterBlockView } from './frontmatter';
import { MathBlockView } from './math';

/**
 * Read-only, kind-dispatched block renderer (WP1 skeleton, WP4/WP6-annotated).
 *
 * Every branch renders from the verbatim `renderModel.raw` slice — no
 * re-parsing. Kinds with direct text editing (paragraph / heading / quote /
 * callout / list / task) are rendered by the WP4 editable views in
 * ComposerRoot; this component covers the remaining kinds. WP6 upgrades two of
 * them from the verbatim mono fallback to interactive views: `table` renders the
 * object-selection grid + toolbar (TableBlockView), and a fenced ```chart code
 * block renders live recharts (ChartBlockView). The rest (math / frontmatter /
 * html / mermaid / dataview / …) stay verbatim — nothing is ever hidden.
 */
export function BlockKindView({ block }: { block: ComposerBlock }): React.ReactElement {
	switch (block.kind) {
		case 'divider':
			return <div className="pk-composer-divider" role="separator" />;
		// WP8 native objects — real, data-driven previews. A fenced ```chart block
		// parses as `code`, so the WP6 chart detector runs first (merge seam).
		case 'code':
			return isChartBlock(block) ? <ChartBlockView block={block} /> : <CodeBlockView block={block} />;
		case 'mermaid':
			return <MermaidBlockView block={block} />;
		case 'base':
			return <BaseBlockView block={block} />;
		case 'canvas':
			return <CanvasBlockView block={block} />;
		case 'excalidraw':
			return <ExcalidrawBlockView block={block} />;
		case 'embed':
			return <EmbedBlockView block={block} />;
		case 'image':
			return <RefView block={block} />;
		case 'table':
			return <TableBlockView block={block} />;
		// WP5 — rich block views (property grid / KaTeX). Interactive AI + vault
		// entrances arrive via ports at the integration seam; without them these
		// render the grid / formulas read-only (never fake affordances).
		case 'frontmatter':
			return <ConnectedFrontmatterBlockView block={block} />;
		case 'math':
			return <MathBlockView block={block} />;
		default:
			return <MonoView block={block} />;
	}
}

function MonoView({ block }: { block: ComposerBlock }): React.ReactElement {
	return (
		<pre className="pk-composer-mono" data-src-text-from={block.source.from} data-block-id={block.blockId}>
			{block.renderModel.raw}
		</pre>
	);
}

function RefView({ block }: { block: ComposerBlock }): React.ReactElement {
	return (
		<span className="pk-composer-ref" data-src-text-from={block.source.from} data-block-id={block.blockId}>
			{block.renderModel.raw}
		</span>
	);
}
