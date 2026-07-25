import * as React from 'react';
import type { ComposerBlock } from '@/core/composer';

/**
 * Read-only, kind-dispatched block renderer (WP1 skeleton, WP4-annotated).
 *
 * Every branch renders from the verbatim `renderModel.raw` slice — no
 * re-parsing. Kinds with direct text editing (paragraph / heading / quote /
 * callout / list / task) are rendered by the WP4 editable views in
 * ComposerRoot; this component covers the remaining read-only kinds (code,
 * math, table, frontmatter, html, mermaid, dataview, …) and the verbatim
 * fallback — nothing is ever hidden or dropped. Each text view carries
 * `data-src-text-from` so cross-structure DOM selection maps to source offsets
 * (S2 mapping contract): the rendered text equals the source slice, making the
 * mapping the identity.
 */
export function BlockKindView({ block }: { block: ComposerBlock }): React.ReactElement {
	switch (block.kind) {
		case 'divider':
			return <div className="pk-composer-divider" role="separator" />;
		case 'image':
		case 'embed':
			return <RefView block={block} />;
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
