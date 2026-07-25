import * as React from 'react';
import {
	Baseline,
	Bold,
	Copy,
	Highlighter,
	Italic,
	Link as LinkIcon,
	MessageSquare,
	Sparkles,
	Strikethrough,
	Underline,
} from 'lucide-react';
import { IconButton } from '@/ui/components/primitives';
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
import { mapDomRangeToSource } from './selectionMapping';

/**
 * Floating selection toolbar (WP4, §7.2–§7.5 / consistency §3).
 *
 * One shell: deterministic formatting (compact 28px square icon controls,
 * radius-md — NOT pills), Easy Copy, comment, then projected AI text actions,
 * separated by group dividers. No font-size control. A selection touching a
 * Code Block disables rich formatting with a reason. Sub-panels (link / colors
 * / copy) open inside the same shell and return focus to their trigger on
 * close. While the toolbar is visible the block action rows are suppressed
 * (single focus owner) via the root's `data-has-selection`.
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

	const recompute = React.useCallback(() => {
		const root = containerRef.current;
		if (!root || !snapshot) return;
		if (Date.now() < suppressUntilRef.current) return;
		const doc = root.ownerDocument;
		const domSel = doc.getSelection();
		if (!domSel || domSel.rangeCount === 0 || domSel.isCollapsed) {
			setLive(null);
			setPanel(null);
			return;
		}
		const range = domSel.getRangeAt(0);
		if (!root.contains(range.commonAncestorContainer)) {
			setLive(null);
			return;
		}
		// Ignore selections inside chrome (comment textarea, panels).
		const anchorEl =
			range.commonAncestorContainer.nodeType === Node.TEXT_NODE
				? range.commonAncestorContainer.parentElement
				: (range.commonAncestorContainer as Element);
		if (anchorEl?.closest('[data-chrome="true"]')) return;
		const mapped = mapDomRangeToSource(root as HTMLElement, range);
		if (!mapped || mapped.from === mapped.to) {
			setLive(null);
			return;
		}
		const partitioned = partitionSourceRange(snapshot, mapped.from, mapped.to);
		if (partitioned.collapsed) {
			setLive(null);
			return;
		}
		const rectPx = range.getBoundingClientRect();
		const rootRect = root.getBoundingClientRect();
		setLive({
			selection: partitioned,
			from: mapped.from,
			to: mapped.to,
			rect: {
				top: Math.max(4, rectPx.top - rootRect.top + root.scrollTop - 44),
				left: Math.max(4, rectPx.left - rootRect.left),
			},
		});
	}, [containerRef, snapshot]);

	useOwnerDocumentListener(containerRef, 'selectionchange', recompute);

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
			role="toolbar"
			aria-label="Selection actions"
			style={{ top: live.rect.top, left: live.rect.left }}
			onMouseDown={(ev) => ev.preventDefault() /* keep the text selection */}
		>
			<div className="pk-selection-toolbar__row">
				{scopeLabel && <span className="pk-selection-scope">{scopeLabel}</span>}
				<span className="pk-selection-group" data-group="format">
					<FormatButton label={sel.formats.bold} reason={formatDisabledReason} onClick={() => void applyFormat('bold')}><Bold size={14} /></FormatButton>
					<FormatButton label={sel.formats.italic} reason={formatDisabledReason} onClick={() => void applyFormat('italic')}><Italic size={14} /></FormatButton>
					<FormatButton label={sel.formats.underline} reason={formatDisabledReason} onClick={() => void applyFormat('underline')}><Underline size={14} /></FormatButton>
					<FormatButton label={sel.formats.strikethrough} reason={formatDisabledReason} onClick={() => void applyFormat('strikethrough')}><Strikethrough size={14} /></FormatButton>
					<FormatButton label={sel.formats.link} reason={formatDisabledReason} onClick={(ev) => togglePanel('link', ev)}><LinkIcon size={14} /></FormatButton>
					<FormatButton label={sel.formats.textColor} reason={formatDisabledReason} onClick={(ev) => togglePanel('text-color', ev)}><Baseline size={14} /></FormatButton>
					<FormatButton label={sel.formats.highlight} reason={formatDisabledReason} onClick={(ev) => togglePanel('highlight', ev)}><Highlighter size={14} /></FormatButton>
				</span>
				<span className="pk-selection-divider" role="separator" />
				<span className="pk-selection-group" data-group="copy-comment">
					<FormatButton label={config.chrome.actions.copy} onClick={(ev) => togglePanel('copy', ev)}><Copy size={14} /></FormatButton>
					<button
						type="button"
						className="pk-selection-text-btn"
						disabled={!runtime.comments || live.selection.units.length !== 1}
						title={live.selection.units.length !== 1 ? sel.guards.crossStructureLink : undefined}
						onClick={() => {
							const unit = live.selection.units[0];
							if (unit) onComment(unit.blockId, { from: live.from, to: live.to });
						}}
					>
						<MessageSquare size={13} /> {sel.comment}
					</button>
				</span>
				{aiActions.length > 0 && (
					<>
						<span className="pk-selection-divider" role="separator" />
						<span className="pk-selection-group" data-group="ai">
							<Sparkles size={13} className="pk-selection-spark" aria-hidden />
							{aiActions.map((d) => (
								<button
									key={d.capabilityId}
									type="button"
									className="pk-selection-text-btn"
									disabled={Boolean(d.disabledReason)}
									title={d.disabledReason}
									onClick={() => aiSnapshot && onInvoke(d, aiSnapshot)}
								>
									{d.title}
								</button>
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
					<button type="button" className="pk-selection-text-btn" onClick={() => void applyLink()}>
						{sel.applyLink}
					</button>
				</div>
			)}
			{(panel === 'text-color' || panel === 'highlight') && (
				<div className="pk-selection-panel" data-panel={panel}>
					{(panel === 'text-color' ? sel.textColors : sel.highlightColors).map((swatch) => (
						<button
							key={swatch.value}
							type="button"
							className="pk-selection-swatch"
							data-selection-color={swatch.value}
							style={{ ['--pk-swatch' as never]: swatch.value }}
							title={swatch.label}
							onClick={() => void applyFormat(panel === 'text-color' ? 'text-color' : 'highlight', swatch.value)}
						>
							<i>{swatch.label}</i>
						</button>
					))}
				</div>
			)}
			{panel === 'copy' && (
				<div className="pk-selection-panel" data-panel="copy">
					{EASY_COPY_ORDER.filter((k) => k !== 'image').map((kind) => (
						<button
							key={kind}
							type="button"
							className="pk-selection-text-btn"
							data-copy-kind={kind}
							onClick={(ev) => void copySelection(kind, ev)}
						>
							{copiedKind === kind ? config.chrome.copy.success : config.chrome.copy[kind]}
						</button>
					))}
					<IconButton label={config.chrome.copy.close} className="pk-selection-panel__close" onClick={closePanel}>
						×
					</IconButton>
				</div>
			)}
		</div>
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
		<button
			type="button"
			className="pk-selection-format-btn"
			aria-label={label}
			title={reason ?? label}
			disabled={Boolean(reason)}
			onClick={onClick}
		>
			{children}
		</button>
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
	if (selection.scope === 'cross-item') return templates.crossItem.replace('{n}', String(selection.units.length));
	if (selection.scope === 'cross-cell') return templates.crossCell.replace('{n}', String(selection.units.length));
	if (selection.scope === 'cross-paragraph') return templates.crossParagraph.replace('{n}', String(blocks));
	return templates.crossBlock.replace('{n}', String(blocks));
}

/**
 * Freeze the selection into a `selection` target carrying the exact byte range
 * inside its unit, so a selection-scoped AI action rewrites ONLY the selected
 * bytes (the text-patch writeback anchors to `[from,to)`). The range is clamped
 * to the FIRST selected unit — a single semantic unit — so the frozen
 * `targetSource`/`selectionText` and the writeback range are byte-identical and
 * a multi-block selection can never patch across a structural separator.
 */
function buildSelectionSnapshot(
	snapshot: NonNullable<ReturnType<typeof useComposerChrome>['snapshot']>,
	live: LiveSelection,
): ComposerContextSnapshot {
	const unit = live.selection.units[0];
	if (!unit) {
		return {
			documentId: snapshot.documentId,
			revision: snapshot.revision,
			target: { kind: 'document', documentId: snapshot.documentId },
			targetSource: snapshot.sourceText.slice(live.from, live.to),
			selectionText: live.selection.text,
			nearby: {
				before: snapshot.sourceText.slice(Math.max(0, live.from - 400), live.from),
				after: snapshot.sourceText.slice(live.to, live.to + 400),
			},
		};
	}
	const from = unit.from;
	const to = unit.to;
	const selectionText = snapshot.sourceText.slice(from, to);
	return {
		documentId: snapshot.documentId,
		revision: snapshot.revision,
		target: {
			kind: 'selection',
			blockId: unit.blockId,
			...(unit.unitId ? { unitId: unit.unitId } : {}),
			from,
			to,
		},
		targetSource: selectionText,
		selectionText,
		nearby: {
			before: snapshot.sourceText.slice(Math.max(0, from - 400), from),
			after: snapshot.sourceText.slice(to, to + 400),
		},
	};
}
