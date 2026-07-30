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
import {
	analyzeLinks,
	embedToLink,
	parseEmbedSelectionRange,
	serializeEmbedSelectionRange,
	setEmbedAnchor,
	type ComposerManagedEmbedSelectionAnchors,
	type ComposerLinkTokenKind,
	type ComposerResourcePreviewState,
} from '@/service/composer';
import { Button } from '@/ui/components/primitives';
import { Input } from '@/ui/component/shared-ui/input';
import { useComposerChrome } from '../../chrome/ComposerChromeContext';
import { NativeEmbedHost, useNativeStrings } from '../nativeBlockShared';

export function EmbedBlockView({ block }: { block: ComposerBlock }): React.ReactElement {
	const strings = useNativeStrings();
	const chrome = useComposerChrome();
	const { onOpenLink } = chrome;
	const raw = block.renderModel.raw;
	const persistedRange = React.useMemo(() => parseEmbedSelectionRange(raw), [raw]);
	const link = React.useMemo(() => analyzeLinks(raw)[0], [raw]);
	const external = link?.kind === 'external';
	const preview = useResourcePreview(
		external ? undefined : chrome.runtime.nativePreviewPort,
		chrome.snapshot?.filePath ?? '',
		link?.target ?? '',
		persistedRange ? { startAnchor: persistedRange.startAnchor, endAnchor: persistedRange.endAnchor } : undefined,
	);
	const isVaultEmbed = !external && /^!\[\[/.test(raw.trim());
	const [expanded, setExpanded] = React.useState(false);
	const [sectionOpen, setSectionOpen] = React.useState(false);
	const [section, setSection] = React.useState(link?.anchor ?? '');
	const [selectionMenu, setSelectionMenu] = React.useState<PreviewSelectionMenu | null>(null);
	const [persistingSelection, setPersistingSelection] = React.useState(false);
	const [selectionAnchorFeedback, setSelectionAnchorFeedback] = React.useState<PreviewSelectionFeedback | null>(null);
	const contentRef = React.useRef<HTMLDivElement>(null);
	const selectionMenuRef = React.useRef<HTMLDivElement>(null);
	const selectionMenuPointerActiveRef = React.useRef(false);

	React.useEffect(() => {
		setSelectionMenu(null);
		setPersistingSelection(false);
		setSelectionAnchorFeedback(null);
	}, [raw]);

	React.useEffect(() => {
		if (!isVaultEmbed || preview?.status !== 'loaded') return;
		const content = contentRef.current;
		if (!content) return;
		const document = content.ownerDocument;
		let releaseMenuPointerTimer: number | undefined;
		const dismiss = (): void => {
			setSelectionMenu(null);
			setSelectionAnchorFeedback(null);
		};
		const dismissWhenSelectionLeavesPreview = (): void => {
			if (selectionMenuPointerActiveRef.current) return;
			const selection = document.getSelection();
			if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
				dismiss();
				return;
			}
			if (!content.contains(selection.getRangeAt(0).commonAncestorContainer)) dismiss();
		};
		const dismissOnOutsidePointer = (event: PointerEvent): void => {
			const target = event.target;
			if (!(target instanceof Node)) return;
			if (selectionMenuRef.current?.contains(target)) {
				selectionMenuPointerActiveRef.current = true;
				return;
			}
			if (content.contains(target)) return;
			dismiss();
		};
		const releaseMenuPointerLock = (): void => {
			if (!selectionMenuPointerActiveRef.current) return;
			if (releaseMenuPointerTimer) window.clearTimeout(releaseMenuPointerTimer);
			releaseMenuPointerTimer = window.setTimeout(() => {
				selectionMenuPointerActiveRef.current = false;
			}, 0);
		};
		document.addEventListener('selectionchange', dismissWhenSelectionLeavesPreview);
		document.addEventListener('pointerdown', dismissOnOutsidePointer);
		document.addEventListener('pointerup', releaseMenuPointerLock);
		content.addEventListener('scroll', dismiss);
		return () => {
			document.removeEventListener('selectionchange', dismissWhenSelectionLeavesPreview);
			document.removeEventListener('pointerdown', dismissOnOutsidePointer);
			document.removeEventListener('pointerup', releaseMenuPointerLock);
			content.removeEventListener('scroll', dismiss);
			if (releaseMenuPointerTimer) window.clearTimeout(releaseMenuPointerTimer);
			selectionMenuPointerActiveRef.current = false;
		};
	}, [isVaultEmbed, preview?.status]);

	React.useEffect(() => {
		if (!selectionAnchorFeedback) return;
		const timeout = window.setTimeout(
			() => setSelectionAnchorFeedback(null),
			selectionAnchorFeedback.tone === 'success' ? 1800 : 5000,
		);
		return () => window.clearTimeout(timeout);
	}, [selectionAnchorFeedback]);

	if (!link) {
		return (
			<span className="pk-composer-ref" data-src-text-from={block.source.from} data-block-id={block.blockId}>
				{raw}
			</span>
		);
	}

	const open = () => onOpenLink?.(external ? 'external' : 'vault', link.target);
	if (!external && preview?.status === 'loaded') {
		const rangeMarkdown = persistedRange && preview.rangeResolved ? preview.rangeText : undefined;
		const sourceEmbed = persistedRange?.originalEmbed ?? raw.trim();
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
		} else if (persistedRange && !rangeMarkdown) {
			fallback = (
				<div className="pk-native-embed-preview" data-block-id={block.blockId} data-range-missing="true">
					<div className="pk-native-embed-preview__header" data-chrome="true">
						<span className="pk-native-embed-preview__kind"><FileText size={14} />{strings.embedLabel}</span>
						<span className="pk-native-embed-preview__target">{preview.name}</span>
					</div>
					<div className="pk-native-embed-preview__excerpt">{strings.embedRangeMissing}</div>
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
			const previousSelection: ComposerManagedEmbedSelectionAnchors | undefined = persistedRange
				? {
					kind: 'range',
					startAnchor: persistedRange.startAnchor,
					endAnchor: persistedRange.endAnchor,
				}
				: link.anchor?.startsWith('^peak-')
					? { kind: 'block', anchor: link.anchor.slice(1) }
					: undefined;
			const capturePreviewSelection = (): void => {
				const content = contentRef.current;
				const selection = content?.ownerDocument.getSelection();
				setSelectionAnchorFeedback(null);
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
				const selectedBlockTextGroups = selectedRenderedBlockTextGroups(range, content);
				const [selectedBlockTexts = [], ...fallbackBlockTextGroups] = selectedBlockTextGroups;
				const rect = range.getBoundingClientRect();
				if (!text || (!rect.width && !rect.height)) {
					setSelectionMenu(null);
					return;
				}
				setSelectionMenu({
					selectedBlockTexts,
					fallbackBlockTextGroups,
					top: Math.max(8, rect.top - 38),
					left: Math.max(8, rect.left),
				});
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
				const next = setEmbedAnchor(sourceEmbed, section);
				if (!next) return;
				void writeSource(next, strings.embedSection);
				setSectionOpen(false);
			};
			const persistSelectedPreview = async (): Promise<void> => {
				const selected = selectionMenu;
				const port = chrome.runtime.embedSelectionAnchorPort;
				if (!selected || selected.selectedBlockTexts.length === 0 || !preview.targetPath) return;
				if (!port) {
					setSelectionMenu(null);
					contentRef.current?.ownerDocument.getSelection()?.removeAllRanges();
					setSelectionAnchorFeedback({
						top: selected.top,
						left: selected.left,
						tone: 'error',
						message: strings.embedAnchorUnavailable,
					});
					return;
				}
				setPersistingSelection(true);
				try {
					const mutation = await port.persistSelection({
						targetPath: preview.targetPath,
						selectedBlockTexts: selected.selectedBlockTexts,
						fallbackBlockTextGroups: selected.fallbackBlockTextGroups,
						previousSelection,
					});
					const next = mutation.kind === 'block'
						? setEmbedAnchor(sourceEmbed, `^${mutation.anchor}`)
						: serializeEmbedSelectionRange(sourceEmbed, mutation);
					if (!next) throw new Error('Unable to update the embed selection');
					try {
						await writeSource(next, strings.embedPreviewSelection);
					} catch (error) {
						try {
							await mutation.rollback();
						} catch (rollbackError) {
							console.error('[Peak Composer] failed to compensate target-note anchor write', {
								targetPath: preview.targetPath,
								rollbackError,
							});
						}
						throw error;
					}
					setSelectionMenu(null);
					contentRef.current?.ownerDocument.getSelection()?.removeAllRanges();
					setSelectionAnchorFeedback({ top: selected.top, left: selected.left, tone: 'success', message: strings.embedAnchorWritten });
				} catch (error) {
					console.error('[Peak Composer] failed to persist selected embed preview range', {
						targetPath: preview.targetPath,
						selectedBlockCount: selected.selectedBlockTexts.length,
						fallbackBlockCounts: selected.fallbackBlockTextGroups.map((group) => group.length),
						error,
					});
					setSelectionMenu(null);
					contentRef.current?.ownerDocument.getSelection()?.removeAllRanges();
					setSelectionAnchorFeedback({
						top: selected.top,
						left: selected.left,
						tone: 'error',
						message: selectionAnchorFailureMessage(error, strings),
					});
				} finally {
					setPersistingSelection(false);
				}
			};
			const returnToFullPreview = async (): Promise<void> => {
				const next = persistedRange ? sourceEmbed : setEmbedAnchor(raw, '') ?? raw;
				const port = chrome.runtime.embedSelectionAnchorPort;
				if (!previousSelection || !port || !preview.targetPath) {
					await writeSource(next, strings.embedReturnToFull);
					return;
				}
				const mutation = await port.releaseSelection({
					targetPath: preview.targetPath,
					selection: previousSelection,
				});
				try {
					await writeSource(next, strings.embedReturnToFull);
				} catch (error) {
					try {
						await mutation.rollback();
					} catch (rollbackError) {
						console.error('[Peak Composer] failed to compensate target-note anchor release', {
							targetPath: preview.targetPath,
							rollbackError,
						});
					}
					throw error;
				}
			};
			const generatedSelectionAnchor = Boolean(previousSelection);
			return (
				<div
					className="pk-native-embed-surface"
					data-expanded={expanded || undefined}
					data-range-preview={Boolean(rangeMarkdown) || undefined}
					data-block-id={block.blockId}
				>
					<div className="pk-native-embed-surface__actions" data-chrome="true">
						<Button variant="ghost" size="sm" onClick={() => void writeSource(embedToLink(sourceEmbed), strings.embedAsLink)}>
							<Link2 size={13} />
							{strings.embedAsLink}
						</Button>
						<Button variant="ghost" size="sm" onClick={() => setExpanded((value) => !value)}>
							{expanded ? strings.embedCompact : strings.embedFull}
						</Button>
						{generatedSelectionAnchor && (
							<Button
								variant="ghost"
								size="sm"
								onClick={() => {
									void returnToFullPreview().catch((error) => {
										console.error('[Peak Composer] failed to return embed to full preview', {
											targetPath: preview.targetPath,
											error,
										});
									});
								}}
							>
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
						onMouseDown={() => {
							setSelectionMenu(null);
							setSelectionAnchorFeedback(null);
						}}
						onMouseUp={capturePreviewSelection}
						onKeyUp={capturePreviewSelection}
					>
						<NativeEmbedHost
							renderer={persistedRange && !rangeMarkdown ? undefined : chrome.runtime.nativeEmbedRenderer}
							sourcePath={rangeMarkdown ? preview.targetPath : chrome.snapshot.filePath}
							target={preview.targetPath}
							kind={preview.extension === 'md' ? 'markdown' : 'attachment'}
							markdown={rangeMarkdown ?? raw.trim()}
							fallback={fallback}
						/>
					</div>
					{selectionMenu && (
						<div
							className="pk-native-embed-selection-menu"
							ref={selectionMenuRef}
							data-chrome="true"
							style={{ top: selectionMenu.top, left: selectionMenu.left }}
						>
							<Button
								variant="secondary"
								size="sm"
								disabled={selectionMenu.selectedBlockTexts.length === 0 || persistingSelection}
								title={selectionMenu.selectedBlockTexts.length === 0 ? strings.embedAnchorNeedsBlock : undefined}
								onMouseDown={(event) => event.preventDefault()}
								onClick={() => void persistSelectedPreview()}
							>
								{persistingSelection ? strings.embedAnchorWriting : strings.embedPreviewSelection}
							</Button>
						</div>
					)}
					{selectionAnchorFeedback && (
						<div
							className="pk-native-embed-selection-feedback"
							data-chrome="true"
							data-tone={selectionAnchorFeedback.tone}
							role="status"
							style={{ top: selectionAnchorFeedback.top, left: selectionAnchorFeedback.left }}
						>
							{selectionAnchorFeedback.message}
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
	selectedBlockTexts: string[];
	fallbackBlockTextGroups: string[][];
	top: number;
	left: number;
}

interface PreviewSelectionFeedback {
	top: number;
	left: number;
	tone: 'success' | 'error';
	message: string;
}

function selectionAnchorFailureMessage(error: unknown, strings: ReturnType<typeof useNativeStrings>): string {
	const message = error instanceof Error ? error.message.toLowerCase() : '';
	if (message.includes('target not found')) return strings.embedAnchorTargetMissing;
	if (message.includes('conflict') || message.includes('revision')) return strings.embedAnchorConflict;
	return strings.embedAnchorError;
}

function selectedRenderedBlockTextGroups(range: Range, root: HTMLElement): string[][] {
	const common = range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
		? range.commonAncestorContainer as Element
		: range.commonAncestorContainer.parentElement;
	const block = common?.closest<HTMLElement>('p, li, ul, ol, blockquote, h1, h2, h3, h4, h5, h6') ?? null;
	const candidates = Array.from(root.querySelectorAll<HTMLElement>('p, li, ul, ol, blockquote, h1, h2, h3, h4, h5, h6'))
		.filter((candidate) => range.intersectsNode(candidate));
	const groups: string[][] = [];
	const addGroup = (elements: readonly HTMLElement[]): void => {
		const texts = elements.flatMap(visibleBlockText);
		if (texts.length === 0 || groups.some((group) => sameBlockTexts(group, texts))) return;
		groups.push(texts);
	};
	if (block && root.contains(block)) addGroup([block]);
	addGroup(candidates
		.filter((candidate) => !candidates.some((other) => other !== candidate && other.contains(candidate)))
	);
	addGroup(candidates
		.filter((candidate) => !candidates.some((other) => other !== candidate && candidate.contains(other)))
	);
	return groups;
}

function sameBlockTexts(left: readonly string[], right: readonly string[]): boolean {
	return left.length === right.length
		&& left.every((text, index) => text.replace(/\s+/g, ' ').trim() === right[index]?.replace(/\s+/g, ' ').trim());
}

function visibleBlockText(block: HTMLElement): string[] {
	const text = block.innerText || block.textContent || '';
	return text.trim() ? [text] : [];
}

function useResourcePreview(
	port: ReturnType<typeof useComposerChrome>['runtime']['nativePreviewPort'],
	sourcePath: string,
	target: string,
	range?: { startAnchor: string; endAnchor: string },
): ComposerResourcePreviewState | null {
	const [state, setState] = React.useState<ComposerResourcePreviewState | null>(null);
	React.useEffect(() => {
		let alive = true;
		if (!port?.resolveResourcePreview || !sourcePath) {
			setState(null);
			return;
		}
		void port.resolveResourcePreview({ sourcePath, target, ...(range ? { range } : {}) }).then((next) => {
			if (alive) setState(next);
		});
		return () => {
			alive = false;
		};
	}, [port, sourcePath, target, range?.startAnchor, range?.endAnchor]);
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
