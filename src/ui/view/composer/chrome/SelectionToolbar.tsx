import * as React from 'react';
import {
	Bold,
	Copy,
	Highlighter,
	Italic,
	Link as LinkIcon,
	MessageSquare,
	Pipette,
	Sparkles,
	Strikethrough,
	Underline,
} from 'lucide-react';
import { Button, IconButton } from '@/ui/components/primitives';
import {
	applyMarkToSelection,
	partitionSourceRange,
	pasteUrlIntoSelection,
	buildEasyCopyText,
	EASY_COPY_ORDER,
	type EasyCopyKind,
} from '@/service/composer';
import type {
	ComposerActionDescriptor,
	ComposerContextSnapshot,
	ComposerInlineMark,
	ComposerSelection,
	SelectionGuardReason,
} from '@/core/composer';
import { useOwnerDocumentListener } from '@/ui/hooks/useOwnerWindow';
import { useComposerChrome } from './ComposerChromeContext';
import {
	mapDomRangeToSource,
	mapDomSelectionToSource,
	restoreDomSelectionFromSource,
} from './selectionMapping';
import {
	clearCrossBlockTextSelection,
	CROSS_BLOCK_SELECTION_EVENT,
	type CrossBlockSelectionDetail,
} from './crossBlockTextSelection';
import { useRovingComposite } from '@/ui/keyboard/useRovingComposite';
import { PEAK_KEYBOARD_ZONE_LABELS } from '@/ui/keyboard/config/KeyboardNavigationDefaults';

/**
 * Floating selection toolbar (WP4, §7.2–§7.5 / consistency §3).
 *
 * One shell: deterministic formatting (compact 28px square icon controls,
 * radius-md — NOT pills), Easy Copy, comment, then projected AI text actions,
 * separated by group dividers. No font-size control. A selection touching a
 * Code Block disables rich formatting with a reason. Sub-panels (link / colors
 * / copy) are visually independent popovers anchored to the compact toolbar
 * and return focus to their trigger on close. While the toolbar is visible the
 * block action rows are suppressed (single focus owner) via the root's
 * `data-has-selection`.
 */
export interface SelectionToolbarProps {
	containerRef: React.RefObject<HTMLElement | null>;
	editingEnabled: boolean;
	onVisibleChange: (visible: boolean) => void;
	onGuard: (reason: SelectionGuardReason) => void;
	onComment: (blockId: string, range: { from: number; to: number }) => void;
	onInvoke: (descriptor: ComposerActionDescriptor, snapshot: ComposerContextSnapshot) => void;
}

type SubPanel = 'link' | 'text-color' | 'highlight' | 'copy' | null;

interface LiveSelection {
	selection: ComposerSelection;
	from: number;
	to: number;
	anchor: number;
	focus: number;
	direction: 'forward' | 'backward' | 'collapsed';
	rect: { top: number; left: number };
}

export function SelectionToolbar({
	containerRef,
	editingEnabled,
	onVisibleChange,
	onGuard,
	onComment,
	onInvoke,
}: SelectionToolbarProps): React.ReactElement | null {
	const chrome = useComposerChrome();
	const { runtime, config, snapshot, projection, flushAll } = chrome;
	const sel = config.chrome.selection;
	const [live, setLive] = React.useState<LiveSelection | null>(null);
	const [panel, setPanel] = React.useState<SubPanel>(null);
	const [linkValue, setLinkValue] = React.useState('');
	const [copiedKind, setCopiedKind] = React.useState<EasyCopyKind | null>(null);
	const panelTriggerRef = React.useRef<HTMLButtonElement | null>(null);
	const toolbarRef = React.useRef<HTMLDivElement | null>(null);
	const suppressUntilRef = React.useRef(0);
	const dismissedLiveRef = React.useRef<LiveSelection | null>(null);
	const entryFocusRef = React.useRef<HTMLElement | null>(null);

	const recompute = React.useCallback(() => {
		const root = containerRef.current;
		if (!root || !snapshot) return;
		if (Date.now() < suppressUntilRef.current) return;
		if (root.hasAttribute('data-cross-block-selection')) return;
		const doc = root.ownerDocument;
		const activeElement = doc.activeElement as Element | null;
		// A sub-panel input owns focus temporarily while the frozen document
		// selection remains the operation target. Do not dismiss the toolbar
		// when the browser moves its live selection into that chrome input.
		if (activeElement?.closest('[data-chrome="true"]')) return;
		const domSel = doc.getSelection();
		if (!domSel || domSel.rangeCount === 0 || domSel.isCollapsed) {
			setLive(null);
			dismissedLiveRef.current = null;
			setPanel(null);
			return;
		}
		const range = domSel.getRangeAt(0);
		if (!root.contains(range.commonAncestorContainer)) {
			setLive(null);
			dismissedLiveRef.current = null;
			return;
		}
		// Ignore selections inside chrome (comment textarea, panels).
		const anchorEl =
			range.commonAncestorContainer.nodeType === 3
				? range.commonAncestorContainer.parentElement
				: (range.commonAncestorContainer as Element);
		if (anchorEl?.closest('[data-chrome="true"]')) return;
		const mapped = mapDomSelectionToSource(root as HTMLElement, domSel);
		if (!mapped || mapped.from === mapped.to) {
			setLive(null);
			dismissedLiveRef.current = null;
			return;
		}
		const dismissed = dismissedLiveRef.current;
		if (dismissed && dismissed.anchor === mapped.anchor && dismissed.focus === mapped.focus) {
			return;
		}
		dismissedLiveRef.current = null;
		const partitioned = partitionSourceRange(snapshot, mapped.from, mapped.to);
		if (partitioned.collapsed) {
			setLive(null);
			dismissedLiveRef.current = null;
			return;
		}
		const rectPx = range.getBoundingClientRect();
		const rootRect = root.getBoundingClientRect();
		setLive({
			selection: partitioned,
			from: mapped.from,
			to: mapped.to,
			anchor: mapped.anchor,
			focus: mapped.focus,
			direction: mapped.direction,
			rect: {
				top: Math.max(4, rectPx.top - rootRect.top + root.scrollTop - 44),
				left: Math.max(4, rectPx.left - rootRect.left),
			},
		});
	}, [containerRef, snapshot]);

	useOwnerDocumentListener(containerRef, 'selectionchange', recompute);
	useRovingComposite(toolbarRef, {
		itemSelector: 'button:not([disabled])',
		orientation: 'horizontal',
		rememberBy: 'aria-label',
		enabled: Boolean(live),
	});
	useOwnerDocumentListener(
		containerRef,
		'keydown',
		(event) => {
			if (event.defaultPrevented || event.isComposing || event.key === 'Process') return;
			if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.key !== 'F10') return;
			const root = containerRef.current;
			const current = live ?? dismissedLiveRef.current;
			if (!root || !current) return;
			const target = event.target as Node | null;
			if (target && !root.contains(target)) return;
			event.preventDefault();
			event.stopPropagation();
			event.stopImmediatePropagation();
			const toolbar = toolbarRef.current;
			if (!toolbar?.contains(root.ownerDocument.activeElement)) {
				const active = root.ownerDocument.activeElement;
				const HTMLElementCtor = root.ownerDocument.defaultView?.HTMLElement;
				entryFocusRef.current = HTMLElementCtor && active instanceof HTMLElementCtor
					? active
					: null;
			}
			if (!live) {
				dismissedLiveRef.current = null;
				setLive(current);
			}
			root.ownerDocument.defaultView?.requestAnimationFrame(() => {
				const nextToolbar = toolbarRef.current;
				const selected = nextToolbar?.querySelector<HTMLElement>('[tabindex="0"]');
				const first = nextToolbar?.querySelector<HTMLElement>('button:not([disabled])');
				(selected ?? first)?.focus({ preventScroll: true });
			});
		},
		true,
	);

	React.useEffect(() => {
		const root = containerRef.current;
		if (!root || !snapshot) return;
		const onCrossBlockSelection = (ev: Event) => {
			const detail = (ev as CustomEvent<CrossBlockSelectionDetail | null>).detail;
			if (!detail) {
				setLive(null);
				dismissedLiveRef.current = null;
				setPanel(null);
				return;
			}
			const mapped = mapDomRangeToSource(root, detail.range);
			if (!mapped || mapped.from === mapped.to) {
				setLive(null);
				dismissedLiveRef.current = null;
				return;
			}
			const partitioned = partitionSourceRange(snapshot, mapped.from, mapped.to);
			if (partitioned.collapsed) {
				setLive(null);
				dismissedLiveRef.current = null;
				return;
			}
			dismissedLiveRef.current = null;
			const rectPx = detail.range.getBoundingClientRect();
			const rootRect = root.getBoundingClientRect();
			const forward = detail.direction === 'forward';
			setLive({
				selection: partitioned,
				from: mapped.from,
				to: mapped.to,
				anchor: forward ? mapped.from : mapped.to,
				focus: forward ? mapped.to : mapped.from,
				direction: detail.direction,
				rect: {
					top: Math.max(4, rectPx.top - rootRect.top + root.scrollTop - 44),
					left: Math.max(4, rectPx.left - rootRect.left),
				},
			});
		};
		root.addEventListener(CROSS_BLOCK_SELECTION_EVENT, onCrossBlockSelection);
		return () => root.removeEventListener(CROSS_BLOCK_SELECTION_EVENT, onCrossBlockSelection);
	}, [containerRef, snapshot]);

	React.useEffect(() => {
		onVisibleChange(Boolean(live));
	}, [live, onVisibleChange]);

	if (!live) return null;

	const hasCode = live.selection.units.some((u) => u.blockKind === 'code');
	const canWrite = editingEnabled && Boolean(runtime.hub);
	const formatDisabledReason = !canWrite
		? config.chrome.actions.disabledNoRuntime
		: hasCode
			? sel.guards.codeBlockRichFormat
			: undefined;
	const aiSnapshot = snapshot ? buildSelectionSnapshot(snapshot, live) : null;
	const aiActions = aiSnapshot ? projection.actionsFor(aiSnapshot, 'selection-toolbar') : [];

	const commitOps = async (
		result: ReturnType<typeof applyMarkToSelection>,
		label: string,
	): Promise<void> => {
		if (!result.ok) {
			onGuard(result.reason);
			return;
		}
		if (!runtime.hub) return;
		// Suppress recompute jitter while the DOM re-renders post-commit.
		suppressUntilRef.current = Date.now() + 250;
		try {
			await runtime.hub.commit({
				origin: 'direct',
				label,
				operations: result.operations,
			});
		} catch {
			// conflict — lifecycle controller surfaces staleness
		}
		containerRef.current?.ownerDocument.getSelection()?.removeAllRanges();
		if (containerRef.current) clearCrossBlockTextSelection(containerRef.current);
		setLive(null);
		setPanel(null);
	};

	const applyFormat = async (mark: ComposerInlineMark, value?: string) => {
		await flushAll();
		const fresh = snapshot ? partitionSourceRange(snapshot, live.from, live.to) : live.selection;
		await commitOps(applyMarkToSelection(fresh, mark, { value }), formatLabel(sel.formats, mark));
	};

	const applyLink = async () => {
		if (!linkValue.trim()) return;
		await flushAll();
		const fresh = snapshot ? partitionSourceRange(snapshot, live.from, live.to) : live.selection;
		await commitOps(pasteUrlIntoSelection(fresh, linkValue.trim()), sel.formats.link);
		setLinkValue('');
	};

	const copySelection = async (kind: EasyCopyKind, ev: React.MouseEvent) => {
		const win = (ev.currentTarget as HTMLElement).ownerDocument.defaultView ?? window;
		const slice = live.selection.sourceText.slice(live.from, live.to);
		const payloads = buildEasyCopyText({ markdown: slice });
		if (kind === 'image') return; // selection image copy is block-level (§7.6)
		await win.navigator.clipboard.writeText(payloads[kind]);
		setCopiedKind(kind);
		win.setTimeout(() => {
			setCopiedKind(null);
			setPanel(null);
		}, 900);
	};

	const closePanel = () => {
		setPanel(null);
		panelTriggerRef.current?.focus();
	};
	const togglePanel = (next: Exclude<SubPanel, null>, ev: React.MouseEvent<HTMLButtonElement>) => {
		panelTriggerRef.current = ev.currentTarget;
		setPanel((p) => (p === next ? null : next));
	};

	const scopeLabel = scopeText(live.selection, sel.scopeTemplates);

	return (
		<div
			ref={toolbarRef}
			className="pk-selection-toolbar"
			data-chrome="true"
			data-composer-contextual-toolbar="selection"
			data-peak-keyboard-zone="cv-contextual"
			data-peak-keyboard-zone-label={PEAK_KEYBOARD_ZONE_LABELS['cv-contextual']}
			role="toolbar"
			aria-label="Selection actions"
			style={{ top: live.rect.top, left: live.rect.left }}
			onMouseDown={(ev) => {
				if ((ev.target as HTMLElement).closest('input')) return;
				ev.preventDefault();
			}}
			onFocusCapture={(event) => {
				const previous = event.relatedTarget;
				const HTMLElementCtor = event.currentTarget.ownerDocument.defaultView?.HTMLElement;
				if (!HTMLElementCtor || !(previous instanceof HTMLElementCtor)) return;
				if (toolbarRef.current?.contains(previous)) return;
				entryFocusRef.current = previous;
			}}
			onKeyDown={(event) => {
				if (event.defaultPrevented || panel || event.key !== 'Escape') return;
				event.preventDefault();
				event.stopPropagation();
				dismissedLiveRef.current = live;
				setLive(null);
				const root = containerRef.current;
				if (!root) return;
				const restore = entryFocusRef.current;
				if (restore?.isConnected) restore.focus({ preventScroll: true });
				restoreDomSelectionFromSource(root, live);
				const selection = root.ownerDocument.getSelection();
				const anchorNode = selection?.anchorNode ?? null;
				const anchorElement = anchorNode?.nodeType === 3
					? anchorNode.parentElement
					: anchorNode as HTMLElement | null;
				anchorElement?.closest<HTMLElement>('[contenteditable="true"]')?.focus({ preventScroll: true });
				restoreDomSelectionFromSource(root, live);
			}}
		>
			<div className="pk-selection-toolbar__row">
				{scopeLabel && <span className="pk-selection-scope">{scopeLabel}</span>}
				<span className="pk-selection-group" data-group="format">
					<FormatButton label={sel.formats.bold} reason={formatDisabledReason} onClick={() => void applyFormat('bold')}><Bold size={14} /></FormatButton>
					<FormatButton label={sel.formats.italic} reason={formatDisabledReason} onClick={() => void applyFormat('italic')}><Italic size={14} /></FormatButton>
					<FormatButton label={sel.formats.underline} reason={formatDisabledReason} onClick={() => void applyFormat('underline')}><Underline size={14} /></FormatButton>
					<FormatButton label={sel.formats.strikethrough} reason={formatDisabledReason} onClick={() => void applyFormat('strikethrough')}><Strikethrough size={14} /></FormatButton>
					<FormatButton label={sel.formats.link} reason={formatDisabledReason} onClick={(ev) => togglePanel('link', ev)}><LinkIcon size={14} /></FormatButton>
					<FormatButton label={sel.formats.textColor} reason={formatDisabledReason} onClick={(ev) => togglePanel('text-color', ev)}>
						<TextColorIcon swatches={sel.quickTextColors} />
					</FormatButton>
					<span
						className="pk-selection-quick-colors"
						data-quick-color-kind="text"
						aria-label={sel.formats.textColor}
					>
						{sel.quickTextColors.map((swatch) => (
							<IconButton
								key={swatch.value}
								label={swatch.label}
								title={formatDisabledReason ?? swatch.label}
								className="pk-selection-quick-color"
								data-quick-text-color={swatch.value}
								disabled={Boolean(formatDisabledReason)}
								onClick={() => void applyFormat('text-color', swatch.value)}
							>
								<span
									className="pk-selection-quick-color__dot"
									style={{ backgroundColor: swatch.value }}
									aria-hidden
								/>
							</IconButton>
						))}
					</span>
					<FormatButton label={sel.formats.highlight} reason={formatDisabledReason} onClick={(ev) => togglePanel('highlight', ev)}><Highlighter size={14} /></FormatButton>
					<span
						className="pk-selection-quick-colors"
						data-quick-color-kind="highlight"
						aria-label={sel.formats.highlight}
					>
						{sel.quickHighlightColors.map((swatch) => (
							<IconButton
								key={swatch.value}
								label={swatch.label}
								title={formatDisabledReason ?? swatch.label}
								className="pk-selection-quick-color"
								data-quick-highlight-color={swatch.value}
								disabled={Boolean(formatDisabledReason)}
								onClick={() => void applyFormat('highlight', swatch.value)}
							>
								<span
									className="pk-selection-quick-color__dot"
									style={{ backgroundColor: swatch.value }}
									aria-hidden
								/>
							</IconButton>
						))}
					</span>
				</span>
				<span className="pk-selection-divider" role="separator" />
				<span className="pk-selection-group" data-group="copy-comment">
					<FormatButton label={config.chrome.actions.copy} onClick={(ev) => togglePanel('copy', ev)}><Copy size={14} /></FormatButton>
						<Button
							variant="ghost"
							size="sm"
							className="pk-selection-text-btn"
							disabled={!runtime.comments || live.selection.units.length !== 1}
							title={live.selection.units.length !== 1 ? sel.guards.crossStructureLink : undefined}
						onClick={() => {
							const unit = live.selection.units[0];
							if (unit) onComment(unit.blockId, { from: live.from, to: live.to });
						}}
						>
							<MessageSquare size={13} /> {sel.comment}
						</Button>
				</span>
				{aiActions.length > 0 && (
					<>
						<span className="pk-selection-divider" role="separator" />
						<span className="pk-selection-group" data-group="ai">
							<Sparkles size={13} className="pk-selection-spark" aria-hidden />
							{aiActions.map((d) => (
									<Button
										key={d.capabilityId}
										variant="ghost"
										size="sm"
										className="pk-selection-text-btn"
										disabled={Boolean(d.disabledReason)}
										title={d.disabledReason}
									onClick={() => aiSnapshot && onInvoke(d, aiSnapshot)}
									>
										{d.title}
									</Button>
							))}
						</span>
					</>
				)}
			</div>
			{panel === 'link' && (
				<div className="pk-selection-panel" data-panel="link">
					<input
						className="pk-selection-panel__input"
						placeholder={sel.linkPlaceholder}
						value={linkValue}
						autoFocus
						onChange={(ev) => setLinkValue(ev.target.value)}
						onKeyDown={(ev) => {
							if (ev.key === 'Enter') void applyLink();
							if (ev.key === 'Escape') closePanel();
						}}
					/>
						<Button variant="ghost" size="sm" className="pk-selection-text-btn" onClick={() => void applyLink()}>
							{sel.applyLink}
						</Button>
					</div>
				)}
				{(panel === 'text-color' || panel === 'highlight') && (
					<div className="pk-selection-panel pk-selection-color-panel" data-panel={panel} aria-label={sel.colorPalette}>
						{(panel === 'text-color' ? sel.textColors : sel.highlightColors).map((swatch) => (
							<IconButton
								key={swatch.value}
								label={swatch.label}
								className="pk-selection-swatch"
								data-selection-color={swatch.value}
								onClick={() => void applyFormat(panel === 'text-color' ? 'text-color' : 'highlight', swatch.value)}
							>
								<span
									className="pk-selection-swatch__color"
									style={{ backgroundColor: swatch.value }}
									aria-hidden
								/>
							</IconButton>
						))}
						<label className="pk-selection-custom-color" aria-label={sel.customColor}>
							<input
								type="color"
								aria-label={sel.customColor}
								defaultValue={panel === 'text-color' ? '#7c3aed' : '#fff1a8'}
								onChange={(ev) =>
									void applyFormat(
										panel === 'text-color' ? 'text-color' : 'highlight',
										ev.currentTarget.value,
									)
								}
							/>
							<Pipette size={12} aria-hidden />
						</label>
					</div>
				)}
			{panel === 'copy' && (
				<div className="pk-selection-panel" data-panel="copy">
					{EASY_COPY_ORDER.filter((k) => k !== 'image').map((kind) => (
							<Button
								key={kind}
								variant="ghost"
								size="sm"
								className="pk-selection-text-btn"
								data-copy-kind={kind}
								onClick={(ev) => void copySelection(kind, ev)}
							>
								{copiedKind === kind ? config.chrome.copy.success : config.chrome.copy[kind]}
							</Button>
					))}
					<IconButton label={config.chrome.copy.close} className="pk-selection-panel__close" onClick={closePanel}>
						×
					</IconButton>
				</div>
			)}
		</div>
	);
}

function TextColorIcon({
	swatches,
}: {
	swatches: Array<{ value: string }>;
}): React.ReactElement {
	return (
		<span className="pk-selection-text-color-icon" aria-hidden>
			<span className="pk-selection-text-color-icon__letter">A</span>
			<span className="pk-selection-text-color-icon__bar">
				{swatches.map((swatch) => (
					<span key={swatch.value} style={{ backgroundColor: swatch.value }} />
				))}
			</span>
		</span>
	);
}

function FormatButton({
	label,
	reason,
	onClick,
	children,
}: {
	label: string;
	reason?: string;
	onClick: (ev: React.MouseEvent<HTMLButtonElement>) => void;
	children: React.ReactNode;
}): React.ReactElement {
	return (
		<IconButton
			label={label}
			className="pk-selection-format-btn"
			title={reason ?? label}
			disabled={Boolean(reason)}
			onClick={onClick}
		>
			{children}
		</IconButton>
	);
}

function formatLabel(formats: Record<string, string>, mark: ComposerInlineMark): string {
	const key = mark === 'text-color' ? 'textColor' : mark;
	return formats[key] ?? mark;
}

function scopeText(
	selection: ComposerSelection,
	templates: { crossParagraph: string; crossItem: string; crossCell: string; crossBlock: string },
): string | null {
	if (selection.scope === 'single') return null;
	const blocks = new Set(selection.units.map((u) => u.blockId)).size;
	const fragments = selection.units.length;
	if (selection.scope === 'cross-item') return fillScopeTemplate(templates.crossItem, fragments, fragments);
	if (selection.scope === 'cross-cell') return fillScopeTemplate(templates.crossCell, fragments, fragments);
	if (selection.scope === 'cross-paragraph') return fillScopeTemplate(templates.crossParagraph, blocks, fragments);
	return fillScopeTemplate(templates.crossBlock, blocks, fragments);
}

function fillScopeTemplate(template: string, count: number, fragments: number): string {
	return template
		.replaceAll('{n}', String(count))
		.replaceAll('{fragments}', String(fragments));
}

/**
 * Freeze the selection into a `selection` target carrying the exact source byte
 * range the user selected. `selectionText` stays user-visible text (partitioned
 * per semantic unit), while `targetSource` keeps the raw bytes the writeback
 * adapter replaces on accept. Multi-unit selections are anchored to the first
 * touched block for UI placement, but they no longer silently collapse to that
 * first unit.
 */
function buildSelectionSnapshot(
	snapshot: NonNullable<ReturnType<typeof useComposerChrome>['snapshot']>,
	live: LiveSelection,
): ComposerContextSnapshot {
	const unit = live.selection.units[0];
	const targetSource = snapshot.sourceText.slice(live.from, live.to);
	if (!unit) {
		return {
			documentId: snapshot.documentId,
			revision: snapshot.revision,
			target: { kind: 'document', documentId: snapshot.documentId },
			targetSource,
			selectionText: live.selection.text,
			nearby: {
				before: snapshot.sourceText.slice(Math.max(0, live.from - 400), live.from),
				after: snapshot.sourceText.slice(live.to, live.to + 400),
			},
		};
	}
	return {
		documentId: snapshot.documentId,
		revision: snapshot.revision,
		target: {
			kind: 'selection',
			blockId: unit.blockId,
			...(live.selection.units.length === 1 && unit.unitId ? { unitId: unit.unitId } : {}),
			from: live.from,
			to: live.to,
		},
		targetSource,
		selectionText: live.selection.text,
		nearby: {
			before: snapshot.sourceText.slice(Math.max(0, live.from - 400), live.from),
			after: snapshot.sourceText.slice(live.to, live.to + 400),
		},
	};
}
