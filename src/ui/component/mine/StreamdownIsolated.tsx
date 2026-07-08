import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import { Notice } from 'obsidian';
import {
	Streamdown,
	defaultRehypePlugins,
	defaultRemarkPlugins,
} from 'streamdown';
import type { PluggableList } from 'unified';
import type { WikilinkPort } from '@/core/ports/WikilinkPort';
import type { VaultNavigationPort } from '@/core/ports/VaultNavigationPort';
import type { ChatVaultWriterPort } from '@/core/ports/ChatVaultWriterPort';
import { useServiceContext } from '@/ui/context/ServiceContext';
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
	// look consistent without leaking Obsidian button chrome. The palette
	// mirrors the streamdown copy/download button hover states.
	btn.style.cssText = [
		'position:absolute',
		'top:8px',
		'right:8px',
		'z-index:2',
		'padding:4px 10px',
		'font-size:11px',
		'font-weight:600',
		'border-radius:6px',
		'border:1px solid hsl(var(--border))',
		'background-color:hsl(var(--background))',
		'color:hsl(var(--foreground))',
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

/** Move Mermaid fullscreen overlay from shadow to body so it covers viewport. */
function setupMermaidFullscreenEscape(shadowRoot: ShadowRoot): () => void {
	const observer = new MutationObserver(() => {
		const fullscreen = shadowRoot.querySelector('.fixed.inset-0');
		if (fullscreen && fullscreen.parentNode === shadowRoot) {
			fullscreen.classList.add(MERMAID_FULLSCREEN_PORTAL_CLASS);
			document.body.appendChild(fullscreen);
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

/** Fallback: render Streamdown in Light DOM when Shadow is unavailable. */
function FallbackStreamdown({
	children,
	isAnimating,
	className,
	onClick,
}: StreamdownIsolatedProps) {
	const { wikilink, vaultNavigation, chatVaultWriter, settings } = useServiceContext();
	const rootFolder = settings.ai.rootFolder;
	const fallbackRootRef = useRef<HTMLDivElement | null>(null);
	useEffect(() => {
		const root = fallbackRootRef.current;
		if (!root) return;
		return setupBasesButtons(root, { rootFolder, chatVaultWriter, vaultNavigation });
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
				isAnimating={isAnimating}
				rehypePlugins={rehypePlugins}
				remarkPlugins={remarkPlugins}
				plugins={{
					math: math,
					mermaid: mermaid,
					cjk: cjk,
					code: code
				}}
				shikiTheme={["one-dark-pro", "one-dark-pro"]}
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

export const StreamdownIsolated: React.FC<StreamdownIsolatedProps> = (props) => {
	const { vaultPreview, wikilink, vaultNavigation, chatVaultWriter, settings } = useServiceContext();
	const basesDeps: BasesInjectionDeps = { rootFolder: settings.ai.rootFolder, chatVaultWriter, vaultNavigation };
	const { children: rawChildren, isAnimating = false, className, onClick } = props;
	// Strip inline $...$ (not $$...$$) to prevent KaTeX from rendering product names as math
	const children = rawChildren.replace(/(?<!\$)\$(?!\$)([^$\n]+?)\$(?!\$)/g, '$1');
	const [useFallback, setUseFallback] = useState(false);
	const [hoverState, setHoverState] = useState<HoverState | null>(null);
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
			const cleanupPart = setupMermaidPartInjection(shadow);
			const cleanupBases = setupBasesButtons(shadow, basesDeps);
			cleanupRef.current = () => {
				cleanupFullscreen();
				cleanupPart();
				cleanupBases();
			};
			// Capture-phase listener on shadow root so we see clicks before Streamdown's button handler.
			const clickHandler = (e: MouseEvent) => {
				const composedPath = e.composedPath?.() ?? [];
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
					isAnimating={isAnimating}
					rehypePlugins={rehypePlugins}
					remarkPlugins={remarkPlugins}
					plugins={{
						math: math,
						mermaid: mermaid,
						cjk: cjk,
						code: code
					}}
					shikiTheme={["one-dark-pro", "one-dark-pro"]}
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
	}, [children, isAnimating, useFallback]);

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

	if (useFallback) {
		return <FallbackStreamdown {...props} />;
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
					document.body
				)}
		</>
	);
};

StreamdownIsolated.displayName = 'StreamdownIsolated';
