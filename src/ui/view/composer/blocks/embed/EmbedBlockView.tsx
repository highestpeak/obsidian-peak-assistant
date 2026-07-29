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
import { ExternalLink, FileText, Image as ImageIcon, LayoutGrid, PenTool, Paperclip, Table2, Link2 } from 'lucide-react';
import type { ComposerBlock } from '@/core/composer';
import { analyzeLinks, type ComposerLinkTokenKind, type ComposerResourcePreviewState } from '@/service/composer';
import { Button } from '@/ui/components/primitives';
import { useComposerChrome } from '../../chrome/ComposerChromeContext';
import { useNativeStrings } from '../nativeBlockShared';

export function EmbedBlockView({ block }: { block: ComposerBlock }): React.ReactElement {
	const strings = useNativeStrings();
	const chrome = useComposerChrome();
	const { onOpenLink } = chrome;
	const raw = block.renderModel.raw;
	const link = React.useMemo(() => analyzeLinks(raw)[0], [raw]);
	const external = link?.kind === 'external';
	const preview = useResourcePreview(
		external ? undefined : chrome.runtime.nativePreviewPort,
		chrome.snapshot?.filePath ?? '',
		link?.target ?? '',
	);

	if (!link) {
		return (
			<span className="pk-composer-ref" data-src-text-from={block.source.from} data-block-id={block.blockId}>
				{raw}
			</span>
		);
	}

	const open = () => onOpenLink?.(external ? 'external' : 'vault', link.target);
	if (!external && preview?.status === 'loaded') {
		if (link.kind === 'attachment' || preview.extension !== 'md') {
			return (
				<div className="pk-native-attachment" data-block-id={block.blockId}>
					<span className="pk-native-attachment__icon" aria-hidden><Paperclip size={20} /></span>
					<div className="pk-native-attachment__content">
						<span className="pk-native-attachment__name">{preview.name}</span>
						<span className="pk-native-attachment__meta">
							{preview.extension.toUpperCase()}
							{preview.pageCount ? ` · ${preview.pageCount} ${strings.pagesSuffix}` : ''}
							{` · ${formatBytes(preview.size)} · ${strings.vaultAttachment}`}
						</span>
					</div>
					<Button variant="outline" size="sm" onClick={open}>
						<ExternalLink size={13} />
						<span>{strings.embedOpenLabel}</span>
					</Button>
				</div>
			);
		}
		return (
			<div className="pk-native-embed-preview" data-block-id={block.blockId}>
				<div className="pk-native-embed-preview__header" data-chrome="true">
					<span className="pk-native-embed-preview__kind"><FileText size={14} />{strings.embedLabel}</span>
					<span className="pk-native-embed-preview__target">{preview.name}{preview.anchor ? `#${preview.anchor}` : ''}</span>
					<span className="pk-native-embed-preview__anchor" data-resolved={preview.anchorResolved ?? undefined}>
						{preview.anchor ? (preview.anchorResolved ? strings.anchorResolved : strings.anchorMissing) : ''}
					</span>
					<Button variant="ghost" size="sm" onClick={open}><ExternalLink size={13} />{strings.embedOpenLabel}</Button>
				</div>
				<div className="pk-native-embed-preview__excerpt">{preview.textExcerpt || strings.embedBroken}</div>
			</div>
		);
	}
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

function useResourcePreview(
	port: ReturnType<typeof useComposerChrome>['runtime']['nativePreviewPort'],
	sourcePath: string,
	target: string,
): ComposerResourcePreviewState | null {
	const [state, setState] = React.useState<ComposerResourcePreviewState | null>(null);
	React.useEffect(() => {
		let alive = true;
		if (!port?.resolveResourcePreview || !sourcePath) {
			setState(null);
			return;
		}
		void port.resolveResourcePreview({ sourcePath, target }).then((next) => {
			if (alive) setState(next);
		});
		return () => {
			alive = false;
		};
	}, [port, sourcePath, target]);
	return state;
}

function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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
