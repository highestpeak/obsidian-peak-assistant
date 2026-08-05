import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import { Notice } from 'obsidian';
import {
	Streamdown,
	defaultRehypePlugins,
	defaultRemarkPlugins,
	type Components,
} from 'streamdown';
import type { PluggableList } from 'unified';
import type { WikilinkPort } from '@/core/ports/WikilinkPort';
import type { VaultNavigationPort } from '@/core/ports/VaultNavigationPort';
import type { ChatVaultWriterPort } from '@/core/ports/ChatVaultWriterPort';
import { SettingsUpdatedEvent, ViewEventType } from '@/core/eventBus';
import { normalizeCodeBlockTheme, type CodeBlockThemeId } from '@/core/config/settingsTypes';
import { useServiceContext } from '@/ui/context/ServiceContext';
import { usePeakEscapeLayer } from '@/ui/keyboard/usePeakKeyboardSurface';
import { portalHostForDocument } from '@/ui/react/ReactRenderer';
import { STREAMDOWN_ISOLATED_CSS } from '@/styles/streamdown-isolated-css';
import { remarkWikilink } from './streamdown';
import { getAIBasesFolder } from '@/core/config/folderPaths';
import { resolveBasesTargetName, stripBasesFilenameHint } from '@/service/chat/bases/basesFileHelpers';
import {
	loadWikilinkPreview,
	parseWikilinkHrefToPath,
	WikilinkHoverCard,
	type PreviewResult,
} from './streamdown/WikilinkHoverPreview';
import { mermaid } from "@streamdown/mermaid";
import { cjk } from "@streamdown/cjk";
import { code } from "@streamdown/code";
import { RotateCcw, X, ZoomIn, ZoomOut } from 'lucide-react';
import { Button } from '@/ui/components/primitives';
import { useChatStudioStrings } from '@/ui/view/chat-view/chatStudioStringsContext';
import {
	MERMAID_INITIAL_VIEWPORT,
	MERMAID_SCALE_STEP,
	panMermaidViewport,
	type MermaidViewport,
	zoomMermaidViewport,
} from './mermaidViewport';

// import { math } from "@streamdown/math";
import { createMathPlugin } from '@streamdown/math';
const math = createMathPlugin({
	singleDollarTextMath: true, // Enable $...$ syntax (default: false)
	errorColor: '#dc2626',      // Custom error color (default: "var(--color-muted-foreground)")
});

/** Rehype plugins (KaTeX, raw, sanitize, harden). */
const rehypePlugins = Object.values(defaultRehypePlugins);

/** Remark plugins: defaults plus wikilink [[...]] parsing. */
const remarkPlugins: PluggableList = [...Object.values(defaultRemarkPlugins), remarkWikilink];
const MERMAID_FULLSCREEN_PORTAL_CLASS = 'peak-mermaid-fullscreen-portal';

/** Part name for Streamdown mermaid blocks so host CSS can target them via ::part(mermaid-container). */
export const MERMAID_PART = 'mermaid-container';

const MERMAID_BLOCK_SELECTOR = '[data-streamdown="mermaid-block"]';

const ReadableTableCell: React.FC<React.ComponentPropsWithoutRef<'td'> & { node?: unknown }> = ({
	node: _node,
	style,
	...props
}) => (
	<td
		{...props}
		data-streamdown="table-cell"
		style={{ ...style, minWidth: '220px' }}
	/>
);

const STREAMDOWN_COMPONENTS: Components = {
	td: ReadableTableCell,
};

/** Set part attribute on all mermaid blocks in shadow so host can style via ::part(mermaid-container). */
function injectMermaidPart(shadowRoot: ShadowRoot): void {
	shadowRoot.querySelectorAll(MERMAID_BLOCK_SELECTOR).forEach((el) => {
		el.setAttribute('part', MERMAID_PART);
	});
}

/** Get wikilink href from an element (same logic as click handler). */
function getWikilinkHref(el: HTMLElement): string | null {
	let href = el.getAttribute?.('href') ?? el.getAttribute?.('data-href') ?? '';
	if (!href && el.getAttribute?.('data-streamdown') === 'link') {
		const text = (el.textContent ?? '').trim();
		const match = text.match(/^\[\[([^\]|]+)(?:\|[^\]]*)?\]\]$/);
		if (match) href = `#peak-wikilink=${encodeURIComponent(match[1].trim())}`;
	}
	return href && parseWikilinkHrefToPath(href) !== null ? href : null;
}

/** Find the link element from a composed event path. Covers HTML `<a>`, SVG `<a>`
 * (mermaid `click` directive), and `[data-streamdown="link"]` wikilink spans. */
function findLinkInPath(composedPath: EventTarget[]): HTMLElement | undefined {
	return composedPath.find((n): n is HTMLElement => {
		if (!(n instanceof HTMLElement) && !(n instanceof SVGElement)) return false;
		const el = n as HTMLElement & SVGElement;
		const tag = el.tagName?.toLowerCase?.() ?? '';
		if (tag === 'a') return true;
		return el.getAttribute?.('data-streamdown') === 'link';
	}) as HTMLElement | undefined;
}

/**
 * Handle wikilink click: extract path from link element, navigate if wikilink.
 * Returns true if handled. T11P (Track I): `app` replaced by narrow
 * `WikilinkPort` + `VaultNavigationPort` — resolution and opening go through
 * named ports, never `app.workspace.openLinkText` directly.
 */
function handleWikilinkClick(
	linkEl: HTMLElement,
	e: { preventDefault: () => void; stopPropagation: () => void },
	wikilink: WikilinkPort,
	vaultNavigation: VaultNavigationPort,
): boolean {
	const href = getWikilinkHref(linkEl);
	if (!href) return false;
	const wikilinkPath = wikilink.resolveHref(href);
	if (!wikilinkPath) return false;
	e.preventDefault();
	e.stopPropagation();
	// Close the Quick Search modal first so the opened file is visible. Same
	// DOM trick as the legacy `openWikilinkPath` helper — kept UI-side because
	// it is hygiene specific to the streamdown host context, not a vault
	// navigation concern.
	const modalEl = document.querySelector('.peak-quick-search-modal')?.closest('.modal-container');
	if (modalEl) {
		(modalEl.querySelector('.modal-close-button') as HTMLElement)?.click();
	}
	void vaultNavigation.openLink(wikilinkPath, { newLeaf: false });
	return true;
}

/** Observe shadow DOM and inject part on mermaid blocks when they appear (initial + streaming). */
function setupMermaidPartInjection(shadowRoot: ShadowRoot): () => void {
	injectMermaidPart(shadowRoot);
	const observer = new MutationObserver(() => injectMermaidPart(shadowRoot));
	observer.observe(shadowRoot, { childList: true, subtree: true });
	return () => observer.disconnect();
}

/**
 * chat-unified-mode 2026-07-05 follow-up: add a "Save & Open in Bases"
 * affordance to every ```base fenced code block. Obsidian's Bases view
 * only renders `.base` files — inline rendering is not possible via any
 * public API — so this button automates the copy → create → open path.
 * The button is idempotent (a `data-peak-bases-btn` flag guards against
 * double-inject on streaming re-renders) and works in both the shadow
 * host and the light-DOM fallback.
 */
const BASE_BLOCK_SELECTOR = '[data-streamdown="code-block"][data-language="base"]';
const BASE_BUTTON_FLAG = 'peakBasesBtn';

interface BasesInjectionDeps {
	rootFolder: string;
	chatVaultWriter: ChatVaultWriterPort;
	vaultNavigation: VaultNavigationPort;
}

function extractBaseSourceFromBlock(block: HTMLElement): string {
	const codeEl = block.querySelector('code');
	// `code.textContent` gives the raw text without highlighting spans,
	// which is what we want for the .base file body.
	return String(codeEl?.textContent ?? '');
}

async function handleSaveAndOpenBases(block: HTMLElement, deps: BasesInjectionDeps): Promise<void> {
	const raw = extractBaseSourceFromBlock(block);
	if (!raw.trim()) {
		new Notice('Nothing to save — the base block is empty.');
		return;
	}
	const target = resolveBasesTargetName(raw);
	const body = stripBasesFilenameHint(raw);
	const folder = getAIBasesFolder(deps.rootFolder);
	try {
		const path = await deps.chatVaultWriter.saveChatMessageToFolder(folder, target.fileName, body);
		new Notice(`Saved ${target.fileName} — opening in Bases…`);
		await deps.vaultNavigation.openVaultPath(path, { newLeaf: 'tab' });
	} catch (err) {
		console.error('[Bases] save-and-open failed', err);
		new Notice('Save & Open in Bases failed. See console for details.');
	}
}

function injectBasesButton(block: HTMLElement, deps: BasesInjectionDeps): void {
	if ((block.dataset as DOMStringMap)[BASE_BUTTON_FLAG]) return;
	(block.dataset as DOMStringMap)[BASE_BUTTON_FLAG] = '1';
	const btn = document.createElement('button');
	btn.type = 'button';
	btn.textContent = 'Save & Open in Bases';
	btn.setAttribute('data-peak-bases-save', '1');
	btn.title = 'Save this YAML to a new .base file and open it in Obsidian';
	// Inline styles so both shadow-scoped and fallback (light-DOM) paths
	// look consistent without leaking Obsidian button chrome.
	//
	// Use `--pk-*` tokens, NOT shadcn `hsl(var(--border/--background/--foreground))`:
	// the shadcn HSL triplets are defined only on the shadow `:host`, so on the
	// FallbackStreamdown (light-DOM) path they resolve to nothing and the button
	// loses its border/background/text colour. `--pk-*` tokens resolve in BOTH
	// contexts — they cascade from the `.pktw-root` view ancestor into the
	// shadow tree (custom properties inherit across the shadow boundary) and are
	// present directly on the light-DOM root. Obsidian globals are the last-ditch
	// fallback so the button is never invisible.
	btn.style.cssText = [
		'position:absolute',
		'top:8px',
		'right:8px',
		'z-index:2',
		'padding:4px 10px',
		'font-size:11px',
		'font-weight:600',
		'border-radius:6px',
		'border:1px solid var(--pk-border, var(--background-modifier-border))',
		'background-color:var(--pk-surface, var(--background-primary))',
		'color:var(--pk-text-primary, var(--text-normal))',
		'cursor:pointer',
		'box-shadow:0 1px 2px rgba(0,0,0,0.06)',
	].join(';');
	btn.addEventListener('click', (e) => {
		e.preventDefault();
		e.stopPropagation();
		void handleSaveAndOpenBases(block, deps);
	});
	// Anchor for the absolutely positioned button.
	if (getComputedStyle(block).position === 'static') {
		block.style.position = 'relative';
	}
	block.appendChild(btn);
}

function injectAllBasesButtons(root: ParentNode, deps: BasesInjectionDeps): void {
	root.querySelectorAll<HTMLElement>(BASE_BLOCK_SELECTOR).forEach((block) => injectBasesButton(block, deps));
}

/**
 * Observe `root` (either a ShadowRoot or an HTMLElement) and inject the
 * Bases affordance on every base code block that appears. Streaming
 * renders trigger MutationObserver callbacks; the per-block flag keeps
 * it idempotent.
 */
function setupBasesButtons(root: ShadowRoot | HTMLElement, deps: BasesInjectionDeps): () => void {
	injectAllBasesButtons(root, deps);
	const observer = new MutationObserver(() => injectAllBasesButtons(root, deps));
	observer.observe(root, { childList: true, subtree: true });
	return () => observer.disconnect();
}

/**
 * Streamdown renders safety-checked links as buttons. Obsidian's inherited
 * button chrome can collapse a long URL into a nearly one-character column,
 * so normalize only links that actually live inside table receipts. Inline
 * layout properties are intentional here: this must work in both the isolated
 * shadow root and the light-DOM fallback regardless of host theme selectors.
 */
function normalizeTableLinks(root: ShadowRoot | HTMLElement): void {
	root.querySelectorAll<HTMLElement>('[data-streamdown="link"]').forEach((link) => {
		const cell = link.closest<HTMLElement>('td');
		if (!cell) return;
		link.style.setProperty('display', 'inline-block', 'important');
		link.style.setProperty('width', 'auto', 'important');
		link.style.setProperty('max-width', '100%', 'important');
		link.style.setProperty('height', 'auto', 'important');
		link.style.setProperty('overflow', 'hidden', 'important');
		link.style.setProperty('text-overflow', 'ellipsis', 'important');
		link.style.setProperty('white-space', 'nowrap', 'important');
		link.style.setProperty('word-break', 'normal', 'important');
		if (!link.title) link.title = link.textContent?.trim() ?? '';
		cell.style.setProperty('min-width', '220px', 'important');
	});
}

function setupReadableTableLinks(root: ShadowRoot | HTMLElement): () => void {
	normalizeTableLinks(root);
	const observer = new MutationObserver(() => normalizeTableLinks(root));
	observer.observe(root, { childList: true, subtree: true });
	return () => observer.disconnect();
}

/** Min length for STREAMDOWN_ISOLATED_CSS to be considered complete (host + streamdown Tailwind + KaTeX). */
const MIN_ISOLATED_CSS_LENGTH = 5000;

/** Allow wikilinks and internal block anchors without Streamdown link-safety modal; other links still show modal. */
const linkSafety = {
	enabled: true,
	onLinkCheck: (url: string) =>
		url.startsWith('#peak-wikilink=') ||
		url.startsWith('peak://wikilink/') ||
		url.startsWith('#block-'),
};

/**
 * Per-`Document` styled host for the relocated Mermaid fullscreen overlay.
 * Lives inside `portalHostForDocument(doc)` (a `.pktw-root .peak-design-root`
 * scope in the CORRECT window) and carries `data-streamdown-root` so the global
 * streamdown Tailwind utilities (`.fixed`, `.inset-0`, `.bg-background/95`, the
 * control buttons…) re-activate on the overlay once it is moved out of the
 * shadow. The `.peak-mermaid-fullscreen-portal` class (peak-components.css)
 * redefines the shadcn HSL vars from `--pk-*` tokens so `hsl(var(--background))`
 * & friends resolve outside the shadow `:host`. One host per Document, reused.
 */
function mermaidFullscreenHost(doc: Document): HTMLElement {
	const portalHost = portalHostForDocument(doc);
	const existing = portalHost.querySelector<HTMLElement>(`:scope > .${MERMAID_FULLSCREEN_PORTAL_CLASS}`);
	if (existing && existing.isConnected) return existing;
	const wrap = doc.createElement('div');
	wrap.className = MERMAID_FULLSCREEN_PORTAL_CLASS;
	wrap.setAttribute('data-streamdown-root', '');
	portalHost.appendChild(wrap);
	return wrap;
}

/**
 * Move the Mermaid fullscreen overlay out of the shadow so `position: fixed`
 * escapes transformed chat-row ancestors and covers the viewport. The OLD
 * target was the bare `document.body`, which (1) sits outside any
 * `[data-streamdown-root]` scope so the overlay's Tailwind + shadcn HSL vars
 * (defined on the shadow `:host`) stop resolving — leaving it transparent /
 * unstyled — and (2) is the WRONG window's body in a detached popout. We now
 * relocate into the scoped, correct-window `mermaidFullscreenHost(doc)` wrapper.
 */
function setupMermaidFullscreenEscape(shadowRoot: ShadowRoot): () => void {
	const doc = shadowRoot.host.ownerDocument;
	const observer = new MutationObserver(() => {
		const fullscreen = shadowRoot.querySelector('.fixed.inset-0');
		if (fullscreen && fullscreen.parentNode === shadowRoot) {
			mermaidFullscreenHost(doc).appendChild(fullscreen);
		}
	});
	observer.observe(shadowRoot, { childList: true, subtree: true });
	return () => observer.disconnect();
}

export type StreamdownIsolatedProps = {
	children: string;
	isAnimating?: boolean;
	className?: string;
	/** Fired in capture phase so host can handle link clicks before Streamdown's handlers (which stopPropagation). */
	onClick?: React.MouseEventHandler<HTMLDivElement>;
};

type FallbackStreamdownProps = StreamdownIsolatedProps & {
	codeBlockTheme: CodeBlockThemeId;
};

function codeBlockThemePair(theme: CodeBlockThemeId): [CodeBlockThemeId, CodeBlockThemeId] {
	return [theme, theme];
}

/** Keep already-mounted message renderers in sync with Settings changes. */
function useLiveCodeBlockTheme(): CodeBlockThemeId {
	const { eventBus, settings } = useServiceContext();
	const [theme, setTheme] = useState(() => normalizeCodeBlockTheme(settings.codeBlockTheme));

	useEffect(() => {
		setTheme(normalizeCodeBlockTheme(settings.codeBlockTheme));
	}, [settings.codeBlockTheme]);

	useEffect(() => eventBus.on<SettingsUpdatedEvent>(ViewEventType.SETTINGS_UPDATED, (event) => {
		setTheme(normalizeCodeBlockTheme(event.settings.codeBlockTheme));
	}), [eventBus]);

	return theme;
}

/** Fallback: render Streamdown in Light DOM when Shadow is unavailable. */
function FallbackStreamdown({
	children,
	isAnimating,
	className,
	onClick,
	codeBlockTheme,
}: FallbackStreamdownProps) {
	const { wikilink, vaultNavigation, chatVaultWriter, settings } = useServiceContext();
	const rootFolder = settings.ai.rootFolder;
	const fallbackRootRef = useRef<HTMLDivElement | null>(null);
	useEffect(() => {
		const root = fallbackRootRef.current;
		if (!root) return;
		const cleanupBases = setupBasesButtons(root, { rootFolder, chatVaultWriter, vaultNavigation });
		const cleanupTableLinks = setupReadableTableLinks(root);
		return () => {
			cleanupBases();
			cleanupTableLinks();
		};
	}, [rootFolder, chatVaultWriter, vaultNavigation]);
	const handleClickCapture = React.useCallback(
		(evt: React.MouseEvent<HTMLDivElement>) => {
			const composedPath = evt.nativeEvent.composedPath?.() ?? [];
			const linkEl = findLinkInPath(composedPath);
			if (linkEl && handleWikilinkClick(linkEl, evt, wikilink, vaultNavigation)) return;
			onClick?.(evt);
		},
		[onClick, wikilink, vaultNavigation]
	);
	return (
		<div
			ref={fallbackRootRef}
			className={className}
			data-streamdown-root
			data-streamdown-mode="fallback"
			onClickCapture={handleClickCapture}
		>
			<Streamdown
				components={STREAMDOWN_COMPONENTS}
				isAnimating={isAnimating}
				rehypePlugins={rehypePlugins}
				remarkPlugins={remarkPlugins}
				plugins={{
					math: math,
					mermaid: mermaid,
					cjk: cjk,
					code: code
				}}
				shikiTheme={codeBlockThemePair(codeBlockTheme)}
				controls={{
					table: true,
					code: true,
					mermaid: {
						download: true,
						copy: true,
						fullscreen: true,
						panZoom: true,
					},
				}}
				linkSafety={linkSafety}
			>
				{children}
			</Streamdown>
		</div>
	);
}

/**
 * Renders Streamdown inside a Shadow DOM for full style isolation from Obsidian.
 * Injects :host + Tailwind (streamdown) + KaTeX CSS. Falls back to Light DOM if CSS is incomplete or Shadow fails.
 */
const HOVER_DEBOUNCE_MS = 180;
const HOVER_CLOSE_DELAY_MS = 100;

type HoverState = { path: string; rect: DOMRect; preview: PreviewResult | null; loading: boolean };
type MermaidFullscreenState = {
	svg: string;
	label: string;
	ownerDocument: Document;
	trigger: HTMLElement;
};
const MERMAID_KEYBOARD_PAN_STEP = 40;

const MERMAID_FULLSCREEN_BOUND_FLAG = 'peakMermaidFullscreenBound';

function findMermaidDiagramSvg(block: HTMLElement | null): SVGSVGElement | undefined {
	if (!block) return undefined;
	return Array.from(block.querySelectorAll<SVGSVGElement>('[data-streamdown="mermaid"] svg'))
		.find((candidate) => !candidate.closest('button'));
}

function setupMermaidFullscreenButtons(
	root: ShadowRoot | HTMLElement,
	ownerDocument: Document,
	open: (state: MermaidFullscreenState) => void,
): () => void {
	const listeners = new Map<HTMLButtonElement, EventListener>();
	const bindButtons = () => {
		root.querySelectorAll<HTMLElement>('[data-streamdown="mermaid-block-actions"]').forEach((actions) => {
			const buttons = actions.querySelectorAll<HTMLButtonElement>('button');
			const button = buttons.item(buttons.length - 1);
			if (!button || button.dataset[MERMAID_FULLSCREEN_BOUND_FLAG]) return;
			button.dataset[MERMAID_FULLSCREEN_BOUND_FLAG] = 'true';
			const listener: EventListener = (rawEvent) => {
				const event = rawEvent as MouseEvent;
				const block = button.closest<HTMLElement>(MERMAID_BLOCK_SELECTOR);
				const svg = findMermaidDiagramSvg(block);
				const label = button.getAttribute('aria-label')?.trim()
					|| button.getAttribute('title')?.trim();
				if (!svg || !label) return;
				event.preventDefault();
				event.stopImmediatePropagation();
				open({ svg: svg.outerHTML, label, ownerDocument, trigger: button });
			};
			button.addEventListener('click', listener, true);
			listeners.set(button, listener);
		});
	};
	bindButtons();
	const observer = new MutationObserver(bindButtons);
	observer.observe(root, { childList: true, subtree: true });
	return () => {
		observer.disconnect();
		for (const [button, listener] of listeners) {
			button.removeEventListener('click', listener, true);
			delete button.dataset[MERMAID_FULLSCREEN_BOUND_FLAG];
		}
	};
}

function fullscreenMermaidFromEvent(
	event: MouseEvent,
	path: EventTarget[],
	ownerDocument: Document,
	open: (state: MermaidFullscreenState) => void,
): boolean {
	const button = path.find((node): node is HTMLButtonElement => {
		if (!node || typeof node !== 'object') return false;
		return (node as Element).nodeType === 1 && (node as Element).tagName === 'BUTTON';
	});
	if (!button) return false;
	const actions = button.closest<HTMLElement>('[data-streamdown="mermaid-block-actions"]');
	if (!actions || actions.querySelector('button:last-of-type') !== button) return false;
	const block = button.closest<HTMLElement>(MERMAID_BLOCK_SELECTOR);
	const svg = findMermaidDiagramSvg(block ?? null);
	// Streamdown currently exposes the control name through aria-label rather
	// than title. Keep title as a compatibility fallback for older releases.
	const label = button.getAttribute('aria-label')?.trim()
		|| button.getAttribute('title')?.trim();
	if (!svg || !label) return false;
	event.preventDefault();
	event.stopImmediatePropagation();
	open({ svg: svg.outerHTML, label, ownerDocument, trigger: button });
	return true;
}

const MermaidFullscreenDialog: React.FC<{
	state: MermaidFullscreenState;
	onClose: () => void;
}> = ({ state, onClose }) => {
	const strings = useChatStudioStrings().mermaidFullscreen;
	const [viewport, setViewport] = useState<MermaidViewport>(MERMAID_INITIAL_VIEWPORT);
	const [dragging, setDragging] = useState(false);
	const dialogRef = useRef<HTMLDivElement | null>(null);
	const canvasRef = useRef<HTMLDivElement | null>(null);
	const viewportRef = useRef(viewport);
	const dragRef = useRef<{
		pointerId: number;
		clientX: number;
		clientY: number;
		originX: number;
		originY: number;
	} | null>(null);
	viewportRef.current = viewport;
	const closeAndRestoreFocus = useCallback(() => {
		onClose();
		const ownerWindow = state.ownerDocument.defaultView;
		const restore = (): void => {
			if (state.trigger.isConnected) state.trigger.focus({ preventScroll: true });
		};
		if (ownerWindow) ownerWindow.setTimeout(restore, 0);
		else restore();
	}, [onClose, state.ownerDocument, state.trigger]);
	usePeakEscapeLayer(
		true,
		dialogRef,
		'mermaid-fullscreen',
		closeAndRestoreFocus,
		state.trigger,
		true,
	);
	useEffect(() => {
		const ownerWindow = state.ownerDocument.defaultView;
		if (!ownerWindow) return;
		const closeTopLayer = (event: KeyboardEvent): void => {
			if (event.key !== 'Escape') return;
			event.preventDefault();
			event.stopPropagation();
			event.stopImmediatePropagation();
			closeAndRestoreFocus();
		};
		// Window capture runs before Obsidian's document-level Modal scope. This
		// guarantees the fullscreen diagram consumes the first Escape instead of
		// allowing the File Atlas modal behind it to close first.
		ownerWindow.addEventListener('keydown', closeTopLayer, true);
		return () => ownerWindow.removeEventListener('keydown', closeTopLayer, true);
	}, [closeAndRestoreFocus, state.ownerDocument]);

	useEffect(() => {
		const body = state.ownerDocument.body;
		const previousOverflow = body.style.overflow;
		body.style.overflow = 'hidden';
		state.ownerDocument.defaultView?.requestAnimationFrame(() => canvasRef.current?.focus());
		return () => {
			body.style.overflow = previousOverflow;
		};
	}, [state.ownerDocument]);

	const trapFocus = (event: React.KeyboardEvent<HTMLDivElement>): void => {
		if (event.key !== 'Tab') return;
		const focusable = [...(dialogRef.current?.querySelectorAll<HTMLElement>(
			'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])',
		) ?? [])].filter((element) => element.offsetParent !== null);
		if (focusable.length === 0) return;
		const first = focusable[0];
		const last = focusable[focusable.length - 1];
		const active = state.ownerDocument.activeElement;
		if (event.shiftKey && active === first) {
			event.preventDefault();
			last.focus();
			return;
		}
		if (!event.shiftKey && active === last) {
			event.preventDefault();
			first.focus();
		}
	};

	const zoomTo = useCallback((requestedScale: number, anchor?: { clientX: number; clientY: number }) => {
		setViewport((current) => {
			if (!anchor || !canvasRef.current) return zoomMermaidViewport(current, requestedScale);
			const rect = canvasRef.current.getBoundingClientRect();
			return zoomMermaidViewport(current, requestedScale, {
				x: anchor.clientX - rect.left - rect.width / 2,
				y: anchor.clientY - rect.top - rect.height / 2,
			});
		});
	}, []);

	const resetViewport = useCallback(() => {
		setViewport(MERMAID_INITIAL_VIEWPORT);
	}, []);

	const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
		if (event.button !== 0) return;
		event.preventDefault();
		event.currentTarget.setPointerCapture(event.pointerId);
		dragRef.current = {
			pointerId: event.pointerId,
			clientX: event.clientX,
			clientY: event.clientY,
			originX: viewportRef.current.x,
			originY: viewportRef.current.y,
		};
		setDragging(true);
	};

	const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
		const drag = dragRef.current;
		if (!drag || drag.pointerId !== event.pointerId) return;
		setViewport((current) => panMermaidViewport(
			{ ...current, x: drag.originX, y: drag.originY },
			event.clientX - drag.clientX,
			event.clientY - drag.clientY,
		));
	};

	const finishPointerDrag = (event: React.PointerEvent<HTMLDivElement>) => {
		if (dragRef.current?.pointerId !== event.pointerId) return;
		if (event.currentTarget.hasPointerCapture(event.pointerId)) {
			event.currentTarget.releasePointerCapture(event.pointerId);
		}
		dragRef.current = null;
		setDragging(false);
	};

	const handleWheel = (event: React.WheelEvent<HTMLDivElement>) => {
		event.preventDefault();
		const factor = Math.exp(-event.deltaY * 0.0015);
		zoomTo(viewportRef.current.scale * factor, {
			clientX: event.clientX,
			clientY: event.clientY,
		});
	};

	const handleCanvasKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
		if (event.key === '+' || event.key === '=') zoomTo(viewportRef.current.scale + MERMAID_SCALE_STEP);
		else if (event.key === '-') zoomTo(viewportRef.current.scale - MERMAID_SCALE_STEP);
		else if (event.key === '0') resetViewport();
		else if (event.key === 'ArrowLeft') setViewport((current) => panMermaidViewport(current, -MERMAID_KEYBOARD_PAN_STEP, 0));
		else if (event.key === 'ArrowRight') setViewport((current) => panMermaidViewport(current, MERMAID_KEYBOARD_PAN_STEP, 0));
		else if (event.key === 'ArrowUp') setViewport((current) => panMermaidViewport(current, 0, -MERMAID_KEYBOARD_PAN_STEP));
		else if (event.key === 'ArrowDown') setViewport((current) => panMermaidViewport(current, 0, MERMAID_KEYBOARD_PAN_STEP));
		else return;
		event.preventDefault();
	};

	return (
		<div
			ref={dialogRef}
			className="pkchat-mermaid-fullscreen"
			role="dialog"
			aria-modal="true"
			aria-label={state.label}
			onClick={closeAndRestoreFocus}
			onKeyDown={trapFocus}
		>
			<div
				className="pkchat-mermaid-fullscreen__toolbar"
				onClick={(event) => event.stopPropagation()}
			>
				<Button
					type="button"
					variant="ghost"
					size="icon"
					aria-label={strings.zoomOutLabel}
					title={strings.zoomOutLabel}
					onClick={() => zoomTo(viewportRef.current.scale - MERMAID_SCALE_STEP)}
				>
					<ZoomOut />
				</Button>
				<span className="pkchat-mermaid-fullscreen__scale" aria-live="polite">
					{Math.round(viewport.scale * 100)}%
				</span>
				<Button
					type="button"
					variant="ghost"
					size="icon"
					aria-label={strings.zoomInLabel}
					title={strings.zoomInLabel}
					onClick={() => zoomTo(viewportRef.current.scale + MERMAID_SCALE_STEP)}
				>
					<ZoomIn />
				</Button>
				<span className="pkchat-mermaid-fullscreen__toolbar-separator" />
				<Button
					type="button"
					variant="ghost"
					size="icon"
					aria-label={strings.resetLabel}
					title={strings.resetLabel}
					onClick={resetViewport}
				>
					<RotateCcw />
				</Button>
			</div>
			<Button
				type="button"
				variant="ghost"
				size="icon"
				className="pkchat-mermaid-fullscreen__close"
				aria-label={strings.closeLabel}
				title={strings.closeLabel}
				onClick={(event) => {
					event.stopPropagation();
					closeAndRestoreFocus();
				}}
			>
				<X />
			</Button>
			<div
				ref={canvasRef}
				className={`pkchat-mermaid-fullscreen__canvas${dragging ? ' is-dragging' : ''}`}
				role="group"
				tabIndex={0}
				aria-label={strings.canvasLabel}
				title={strings.hint}
				onClick={(event) => event.stopPropagation()}
				onPointerDown={handlePointerDown}
				onPointerMove={handlePointerMove}
				onPointerUp={finishPointerDrag}
				onPointerCancel={finishPointerDrag}
				onWheel={handleWheel}
				onKeyDown={handleCanvasKeyDown}
			>
				<div
					className="pkchat-mermaid-fullscreen__content"
					style={{ transform: `translate3d(${viewport.x}px, ${viewport.y}px, 0) scale(${viewport.scale})` }}
					dangerouslySetInnerHTML={{ __html: state.svg }}
				/>
			</div>
			<div className="pkchat-mermaid-fullscreen__hint">{strings.hint}</div>
		</div>
	);
};

export const StreamdownIsolated: React.FC<StreamdownIsolatedProps> = (props) => {
	const { vaultPreview, wikilink, vaultNavigation, chatVaultWriter, settings } = useServiceContext();
	const codeBlockTheme = useLiveCodeBlockTheme();
	const shikiTheme = React.useMemo(() => codeBlockThemePair(codeBlockTheme), [codeBlockTheme]);
	const basesDeps: BasesInjectionDeps = { rootFolder: settings.ai.rootFolder, chatVaultWriter, vaultNavigation };
	const { children: rawChildren, isAnimating = false, className, onClick } = props;
	// Strip inline $...$ (not $$...$$) to prevent KaTeX from rendering product names as math
	const children = rawChildren.replace(/(?<!\$)\$(?!\$)([^$\n]+?)\$(?!\$)/g, '$1');
	const [useFallback, setUseFallback] = useState(false);
	const [hoverState, setHoverState] = useState<HoverState | null>(null);
	const [mermaidFullscreen, setMermaidFullscreen] = useState<MermaidFullscreenState | null>(null);
	const hostRef = useRef<HTMLDivElement | null>(null);
	const rootRef = useRef<Root | null>(null);
	const cleanupRef = useRef<(() => void) | null>(null);
	const onClickRef = useRef(onClick);
	const setHoverStateRef = useRef(setHoverState);
	const hoverDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const closeDelayRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	onClickRef.current = onClick;
	setHoverStateRef.current = setHoverState;

	useLayoutEffect(() => {
		if (useFallback) return;
		const host = hostRef.current;
		if (!host) return;

		let shadow = host.shadowRoot;
		let container: HTMLDivElement | null = null;

		if (shadow) {
			const existing = shadow.querySelector('.streamdown-wrapper');
			// Use a fresh container so we never call createRoot() on the same DOM node twice
			// (avoids React warning in Strict Mode when effect runs, cleanup unmounts, effect re-runs).
			container = document.createElement('div');
			container.setAttribute('data-streamdown-root', '');
			container.className = 'streamdown-wrapper';
			if (existing?.parentNode) {
				existing.parentNode.replaceChild(container, existing);
			} else {
				shadow.appendChild(container);
			}
		} else {
			const css =
				typeof STREAMDOWN_ISOLATED_CSS === 'string' ? STREAMDOWN_ISOLATED_CSS : '';
			if (css.length < MIN_ISOLATED_CSS_LENGTH) {
				setUseFallback(true);
				return;
			}
			try {
				shadow = host.attachShadow({ mode: 'open' });
				const style = document.createElement('style');
				style.textContent = css;
				shadow.appendChild(style);
				container = document.createElement('div');
				container.setAttribute('data-streamdown-root', '');
				container.className = 'streamdown-wrapper';
				shadow.appendChild(container);
			} catch (e) {
				setUseFallback(true);
				return;
			}
		}

		if (!shadow || !container) return;

		try {
			const root = createRoot(container);
			(rootRef as React.MutableRefObject<Root | null>).current = root;
			const cleanupFullscreen = setupMermaidFullscreenEscape(shadow);
			const cleanupFullscreenButtons = setupMermaidFullscreenButtons(
				shadow,
				host.ownerDocument,
				setMermaidFullscreen,
			);
			const cleanupPart = setupMermaidPartInjection(shadow);
			const cleanupBases = setupBasesButtons(shadow, basesDeps);
			const cleanupTableLinks = setupReadableTableLinks(shadow);
			cleanupRef.current = () => {
				cleanupFullscreen();
				cleanupFullscreenButtons();
				cleanupPart();
				cleanupBases();
				cleanupTableLinks();
			};
			// Capture-phase listener on shadow root so we see clicks before Streamdown's button handler.
			const clickHandler = (e: MouseEvent) => {
				const composedPath = e.composedPath?.() ?? [];
				if (fullscreenMermaidFromEvent(e, composedPath, host.ownerDocument, setMermaidFullscreen)) return;
				const linkEl = findLinkInPath(composedPath);
				if (linkEl && handleWikilinkClick(linkEl, e, wikilink, vaultNavigation)) return;
				// Delegate to optional onClick prop passed by caller.
				const cb = onClickRef.current;
				if (!cb || !host) return;
				const synthetic = {
					nativeEvent: e,
					preventDefault: () => e.preventDefault(),
					stopPropagation: () => e.stopPropagation(),
					target: e.target,
					currentTarget: host,
				} as unknown as React.MouseEvent<HTMLDivElement>;
				cb(synthetic);
			};
			shadow.addEventListener('click', clickHandler, true);

			const mouseoverHandler = (e: MouseEvent) => {
				const link = findLinkInPath(e.composedPath?.() ?? []);
				if (!link) return;
				const href = getWikilinkHref(link);
				if (!href) return;
				const raw = parseWikilinkHrefToPath(href);
				if (!raw || raw.startsWith('#')) return;
				const resolved = wikilink.resolveTarget(raw);
				if (!resolved) return;
				if (hoverDebounceRef.current) clearTimeout(hoverDebounceRef.current);
				if (closeDelayRef.current) clearTimeout(closeDelayRef.current);
				closeDelayRef.current = null;
				hoverDebounceRef.current = setTimeout(() => {
					setHoverStateRef.current?.({ path: resolved, rect: link.getBoundingClientRect(), preview: null, loading: true });
				}, HOVER_DEBOUNCE_MS);
			};
			const mouseoutHandler = () => {
				if (hoverDebounceRef.current) { clearTimeout(hoverDebounceRef.current); hoverDebounceRef.current = null; }
				if (closeDelayRef.current) clearTimeout(closeDelayRef.current);
				closeDelayRef.current = setTimeout(() => setHoverStateRef.current?.(null), HOVER_CLOSE_DELAY_MS);
			};
			shadow.addEventListener('mouseover', mouseoverHandler, true);
			shadow.addEventListener('mouseout', mouseoutHandler, true);

			const prevCleanup = cleanupRef.current;
			cleanupRef.current = () => {
				prevCleanup?.();
				shadow.removeEventListener('click', clickHandler, true);
				shadow.removeEventListener('mouseover', mouseoverHandler, true);
				shadow.removeEventListener('mouseout', mouseoutHandler, true);
			};
		} catch (e) {
			setUseFallback(true);
			return;
		}

		return () => {
			cleanupRef.current?.();
			cleanupRef.current = null;
			if (hoverDebounceRef.current) clearTimeout(hoverDebounceRef.current);
			if (closeDelayRef.current) clearTimeout(closeDelayRef.current);
			setHoverStateRef.current?.(null);
			const root = (rootRef as React.MutableRefObject<Root | null>).current;
			(rootRef as React.MutableRefObject<Root | null>).current = null;
			if (root) {
				// Defer to next macrotask so unmount never runs during commit (AnimatePresence branch switch).
				const r = root;
				setTimeout(() => {
					try { r.unmount(); } catch (_) { /* ignore */ }
				}, 0);
			}
		};
	}, [useFallback, wikilink, vaultNavigation, chatVaultWriter, settings.ai.rootFolder]);

	useLayoutEffect(() => {
		if (useFallback) return;
		const root = (rootRef as React.MutableRefObject<Root | null>).current;
		if (root) {
			root.render(
				<Streamdown
					components={STREAMDOWN_COMPONENTS}
					isAnimating={isAnimating}
					rehypePlugins={rehypePlugins}
					remarkPlugins={remarkPlugins}
					plugins={{
						math: math,
						mermaid: mermaid,
						cjk: cjk,
						code: code
					}}
					shikiTheme={shikiTheme}
					controls={{
						table: true,
						code: true,
						mermaid: {
							download: true,
							copy: true,
							fullscreen: true,
							panZoom: true,
						},
					}}
					mermaid={{
						config: {
							// Disable auto window.load listener to avoid zombie listeners on plugin reload (memory leak)
							startOnLoad: false,
						},
					}}
					linkSafety={linkSafety}
				>
					{children}
				</Streamdown>
			);
		}
	}, [children, isAnimating, shikiTheme, useFallback]);

	// Load wikilink preview when hover target is set (shadow mode only).
	useEffect(() => {
		if (!hoverState?.path || useFallback) return;
		const path = hoverState.path;
		let cancelled = false;
		loadWikilinkPreview(path, vaultPreview).then((preview) => {
			if (!cancelled)
				setHoverState((prev) => (prev && prev.path === path ? { ...prev, preview, loading: false } : prev));
		});
		return () => {
			cancelled = true;
		};
	}, [hoverState?.path, useFallback, vaultPreview]);

	const handleHoverClose = useCallback(() => {
		if (closeDelayRef.current) clearTimeout(closeDelayRef.current);
		closeDelayRef.current = null;
		setHoverState(null);
	}, []);

	const handleEnterCard = useCallback(() => {
		if (closeDelayRef.current) clearTimeout(closeDelayRef.current);
		closeDelayRef.current = null;
	}, []);
	const closeMermaidFullscreen = useCallback(() => setMermaidFullscreen(null), []);

	if (useFallback) {
		return <FallbackStreamdown {...props} codeBlockTheme={codeBlockTheme} />;
	}

	return (
		<>
			<div
				ref={(el) => {
					(hostRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
				}}
				className={className}
				data-streamdown-root
				data-streamdown-mode="shadow"
				style={{ display: 'block', minHeight: '1em', userSelect: 'text' }}
			/>
			{hoverState &&
				createPortal(
					<WikilinkHoverCard
						path={hoverState.path}
						preview={hoverState.preview}
						loading={hoverState.loading}
						rect={hoverState.rect}
						onClose={handleHoverClose}
						onEnterCard={handleEnterCard}
					/>,
					// Portal into the scoped, correct-window host — NOT the bare
					// `document.body`. The card's inline `var(--pk-*)` colours only
					// resolve inside a `.pktw-root .peak-design-root` scope, and the
					// global `document` would target the MAIN window under a popout.
					portalHostForDocument(hostRef.current?.ownerDocument ?? document)
				)}
			{mermaidFullscreen && createPortal(
				<MermaidFullscreenDialog state={mermaidFullscreen} onClose={closeMermaidFullscreen} />,
				portalHostForDocument(mermaidFullscreen.ownerDocument),
			)}
		</>
	);
};

StreamdownIsolated.displayName = 'StreamdownIsolated';
