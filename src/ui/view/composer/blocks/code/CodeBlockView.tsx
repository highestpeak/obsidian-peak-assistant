/**
 * Peak Composer — Code Block read-only view (WP8, §7.4 / §10.11).
 *
 * Code only shows/edits code — rich inline formatting is suppressed (that is the
 * WP4 chrome's job; this view never renders styled runs). The body is the
 * verbatim fenced source with newlines/indentation/tabs intact, carrying
 * `data-src-text-from` so cross-structure selection maps to source offsets. A
 * language badge is the only affordance; copy/AI live in the shared action row.
 */

import * as React from 'react';
import type { ComposerBlock } from '@/core/composer';
import { parseCodeFence } from '@/service/composer';

export function CodeBlockView({ block }: { block: ComposerBlock }): React.ReactElement {
	const raw = block.renderModel.raw;
	const fence = React.useMemo(() => parseCodeFence(raw), [raw]);
	const language = fence?.language || block.renderModel.language || '';
	// The mapped <pre> renders the VERBATIM full slice (fence included) so the S2
	// selection-mapping identity holds (rendered text === source.slice(from,to)).
	// The language badge is decorative chrome outside the mapped node.
	return (
		<div className="pk-native-code" data-block-id={block.blockId} data-lang={language || undefined}>
			{language && <span className="pk-native-code__lang" data-chrome="true">{language}</span>}
			<pre className="pk-composer-mono pk-native-code__body" data-src-text-from={block.source.from} data-block-id={block.blockId}>
				{raw}
			</pre>
		</div>
	);
}
