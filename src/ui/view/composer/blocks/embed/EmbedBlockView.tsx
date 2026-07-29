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
import { analyzeLinks, embedToLink, setEmbedAnchor, type ComposerLinkTokenKind, type ComposerResourcePreviewState } from '@/service/composer';
import { Button } from '@/ui/components/primitives';
import { Input } from '@/ui/component/shared-ui/input';
import { useComposerChrome } from '../../chrome/ComposerChromeContext';
import { NativeEmbedHost, useNativeStrings } from '../nativeBlockShared';

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
	const isVaultEmbed = !external && /^!\[\[/.test(raw.trim());
	const [expanded, setExpanded] = React.useState(false);
	const [sectionOpen, setSectionOpen] = React.useState(false);
	const [section, setSection] = React.useState(link?.anchor ?? '');
	const [selectionMenu, setSelectionMenu] = React.useState<PreviewSelectionMenu | null>(null);
	const [persistingSelection, setPersistingSelection] = React.useState(false);
	const [selectionAnchorError, setSelectionAnchorError] = React.useState(false);
	const contentRef = React.useRef<HTMLDivElement>(null);

	React.useEffect(() => {
		setSelectionMenu(null);
		setPersistingSelection(false);
		setSelectionAnchorError(false);
	}, [raw]);

	if (!link) {
		return (
			<span className="pk-composer-ref" data-src-text-from={block.source.from} data-block-id={block.blockId}>
				{raw}
			</span>
		);
	}

	const open = () => onOpenLink?.(external ? 'external' : 'vault', link.target);
	if (!external && preview?.status === 'loaded') {
		let fallback: React.ReactElement;
		if (link.kind === 'attachment' || preview.extension !== 'md') {
			fallback = (
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
		} else {
			fallback = (
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
		if (isVaultEmbed && chrome.snapshot) {
			const capturePreviewSelection = (): void => {
				const content = contentRef.current;
				const selection = content?.ownerDocument.getSelection();
				setSelectionAnchorError(false);
				if (!content || !selection || selection.rangeCount === 0 || selection.isCollapsed) {
					setSelectionMenu(null);
					return;
				}
				const range = selection.getRangeAt(0);
				if (!content.contains(range.commonAncestorContainer)) {
					setSelectionMenu(null);
					return;
				}
				const text = selection.toString().trim();
				const selectedBlockText = selectedRenderedBlockText(range, content);
				const rect = range.getBoundingClientRect();
				if (!text || (!rect.width && !rect.height)) {
					setSelectionMenu(null);
					return;
				}
				setSelectionMenu({ selectedBlockText, top: Math.max(8, rect.top - 38), left: Math.max(8, rect.left) });
			};
			const writeSource = async (text: string, label: string): Promise<void> => {
				const hub = chrome.runtime.hub;
				if (!hub) throw new Error('Composer transaction hub is unavailable');
				await hub.commit({
					origin: 'direct',
					label,
					operations: [{ kind: 'replaceRange', from: block.source.from, to: block.source.to, text }],
					target: { kind: 'block', blockId: block.blockId },
					expectedBlockDelta: 0,
				});
			};
			const applySection = (): void => {
				const next = setEmbedAnchor(raw, section);
				if (!next) return;
				void writeSource(next, strings.embedSection);
				setSectionOpen(false);
			};
			const persistSelectedPreview = async (): Promise<void> => {
				const selected = selectionMenu;
				const port = chrome.runtime.embedSelectionAnchorPort;
				if (!selected?.selectedBlockText || !port || !preview.targetPath) return;
				setPersistingSelection(true);
				try {
					const result = await port.persistSelection({
						targetPath: preview.targetPath,
						selectedBlockText: selected.selectedBlockText,
					});
					const next = setEmbedAnchor(raw, `^${result.anchor}`);
					if (!next) throw new Error('Unable to update the embed anchor');
					await writeSource(next, strings.embedPreviewSelection);
					setSelectionMenu(null);
					contentRef.current?.ownerDocument.getSelection()?.removeAllRanges();
				} catch {
					setSelectionAnchorError(true);
				} finally {
					setPersistingSelection(false);
				}
			};
			const generatedSelectionAnchor = link.anchor?.startsWith('^peak-') ?? false;
			return (
				<div className="pk-native-embed-surface" data-expanded={expanded || undefined} data-block-id={block.blockId}>
					<div className="pk-native-embed-surface__actions" data-chrome="true">
						<Button variant="ghost" size="sm" onClick={() => void writeSource(embedToLink(raw.trim()), strings.embedAsLink)}>
							<Link2 size={13} />
							{strings.embedAsLink}
						</Button>
						<Button variant="ghost" size="sm" onClick={() => setExpanded((value) => !value)}>
							{expanded ? strings.embedCompact : strings.embedFull}
						</Button>
						{generatedSelectionAnchor && (
							<Button variant="ghost" size="sm" onClick={() => void writeSource(setEmbedAnchor(raw, '') ?? raw, strings.embedReturnToFull)}>
								{strings.embedReturnToFull}
							</Button>
						)}
						{preview.extension === 'md' && (
							<Button variant="ghost" size="sm" onClick={() => setSectionOpen((value) => !value)}>{strings.embedSection}</Button>
						)}
					</div>
					{sectionOpen && preview.extension === 'md' && (
						<div className="pk-native-embed-surface__section" data-chrome="true">
							<Input value={section} placeholder={strings.embedSectionPlaceholder} onChange={(event) => setSection(event.target.value)} />
							<Button variant="secondary" size="sm" onClick={applySection}>{strings.embedApplySection}</Button>
						</div>
					)}
					<div
						className="pk-native-embed-surface__content"
						ref={contentRef}
						onMouseDown={() => setSelectionMenu(null)}
						onMouseUp={capturePreviewSelection}
						onKeyUp={capturePreviewSelection}
					>
						<NativeEmbedHost
							renderer={chrome.runtime.nativeEmbedRenderer}
							sourcePath={chrome.snapshot.filePath}
							target={preview.targetPath}
							kind={preview.extension === 'md' ? 'markdown' : 'attachment'}
							markdown={raw.trim()}
							fallback={fallback}
						/>
					</div>
					{selectionMenu && (
						<div
							className="pk-native-embed-selection-menu"
							data-chrome="true"
							style={{ top: selectionMenu.top, left: selectionMenu.left }}
						>
							<Button
								variant="secondary"
								size="sm"
								disabled={!selectionMenu.selectedBlockText || !chrome.runtime.embedSelectionAnchorPort || persistingSelection}
								title={!selectionMenu.selectedBlockText ? strings.embedAnchorNeedsBlock : undefined}
								onMouseDown={(event) => event.preventDefault()}
								onClick={() => void persistSelectedPreview()}
							>
								{persistingSelection ? strings.embedAnchorWriting : strings.embedPreviewSelection}
							</Button>
							{selectionAnchorError && (
								<span className="pk-native-embed-selection-menu__error">{strings.embedAnchorError}</span>
							)}
						</div>
					)}
				</div>
			);
		}
		return fallback;
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

interface PreviewSelectionMenu {
	selectedBlockText: string | null;
	top: number;
	left: number;
}

function selectedRenderedBlockText(range: Range, root: HTMLElement): string | null {
	const common = range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
		? range.commonAncestorContainer as Element
		: range.commonAncestorContainer.parentElement;
	const block = common?.closest('p, li, ul, ol, blockquote, h1, h2, h3, h4, h5, h6') ?? null;
	if (!block || !root.contains(block)) return null;
	const selected = normalizeRenderedText(range.toString());
	const blockText = block instanceof HTMLElement ? block.innerText : block.textContent ?? '';
	if (!selected || selected !== normalizeRenderedText(blockText)) return null;
	return blockText;
}

function normalizeRenderedText(text: string): string {
	return text.replace(/\s+/g, ' ').trim();
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
