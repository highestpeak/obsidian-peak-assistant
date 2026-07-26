/**
 * Peak Composer — embed / reference block view (WP8, §10.13).
 *
 * An embed (`![[note]]`, `![[diagram.canvas]]`, `![](img.png)`, …) renders as a
 * navigable reference card: a kind badge plus the target as a focusable
 * `.pk-composer-link` span. That class + `data-link-target` is exactly what the
 * WP4 LinkPreviewLayer delegates over, so the target is hover / click / keyboard
 * reachable for free (§10.13: all navigation targets reachable). The referenced
 * file's content lives in another file and is not inlined by the read-only host.
 */

import * as React from 'react';
import { FileText, Image as ImageIcon, LayoutGrid, PenTool, Paperclip, Table2, Link2 } from 'lucide-react';
import type { ComposerBlock } from '@/core/composer';
import { analyzeLinks, type ComposerLinkTokenKind } from '@/service/composer';
import { useComposerChrome } from '../../chrome/ComposerChromeContext';
import { useNativeStrings } from '../nativeBlockShared';

export function EmbedBlockView({ block }: { block: ComposerBlock }): React.ReactElement {
	const strings = useNativeStrings();
	const { onOpenLink } = useComposerChrome();
	const raw = block.renderModel.raw;
	const link = React.useMemo(() => analyzeLinks(raw)[0], [raw]);

	if (!link) {
		return (
			<span className="pk-composer-ref" data-src-text-from={block.source.from} data-block-id={block.blockId}>
				{raw}
			</span>
		);
	}

	const external = link.kind === 'external';
	const open = () => onOpenLink?.(external ? 'external' : 'vault', link.target);
	return (
		<div className="pk-native-embed" data-block-id={block.blockId} data-embed-kind={link.kind}>
			<span className="pk-native-embed__badge" aria-hidden>
				<KindIcon kind={link.kind} target={link.target} />
			</span>
			<span
				className="pk-composer-link pk-native-embed__target"
				data-link-target={link.target}
				data-src-text-from={block.source.from}
				tabIndex={0}
				role="link"
				onClick={open}
				onKeyDown={(ev) => {
					if (ev.key === 'Enter' || ev.key === ' ') {
						ev.preventDefault();
						open();
					}
				}}
			>
				{link.display ?? link.target}
			</span>
		</div>
	);
}

function KindIcon({ kind, target }: { kind: ComposerLinkTokenKind; target: string }): React.ReactElement {
	if (kind === 'image') return <ImageIcon size={14} />;
	if (kind === 'attachment') return <Paperclip size={14} />;
	if (kind === 'external') return <Link2 size={14} />;
	// Native-file embeds (base/canvas/excalidraw) get a format-specific badge.
	const ext = target.split('#')[0].split('.').pop()?.toLowerCase() ?? '';
	if (ext === 'canvas') return <LayoutGrid size={14} />;
	if (ext === 'base') return <Table2 size={14} />;
	if (ext === 'excalidraw') return <PenTool size={14} />;
	return <FileText size={14} />;
}
