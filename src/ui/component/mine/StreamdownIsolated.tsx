import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import {
	Streamdown,
	defaultRehypePlugins,
	defaultRemarkPlugins,
} from 'streamdown';
import type { PluggableList } from 'unified';
import { AppContext } from '@/app/context/AppContext';
import { STREAMDOWN_ISOLATED_CSS } from '@/styles/streamdown-isolated-css';
import { remarkWikilink } from './streamdown';
import {
	loadWikilinkPreview,
	parseWikilinkHrefToPath,
	resolveWikilinkTargetToPath,
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

/** Observe shadow DOM and inject part on mermaid blocks when they appear (initial + streaming). */
function setupMermaidPartInjection(shadowRoot: ShadowRoot): () => void {
	injectMermaidPart(shadowRoot);
	const observer = new MutationObserver(() => injectMermaidPart(shadowRoot));
	observer.observe(shadowRoot, { childList: true, subtree: true });
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
	return (
		<div
			className={className}
			data-streamdown-root
			data-streamdown-mode="fallback"
			onClickCapture={onClick}
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
const DEBUG = false;

const HOVER_DEBOUNCE_MS = 180;
const HOVER_CLOSE_DELAY_MS = 100;

type HoverState = { path: string; rect: DOMRect; preview: PreviewResult | null; loading: boolean };

export const StreamdownIsolated: React.FC<StreamdownIsolatedProps> = (props) => {
	const { children, isAnimating = false, className, onClick } = props;
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
				if (DEBUG) {
					console.warn(
						'[StreamdownIsolated] STREAMDOWN_ISOLATED_CSS too short (' +
						css.length +
						'). Run: npm run build:css'
					);
				}
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
				if (DEBUG) {
					console.warn('[StreamdownIsolated] Shadow DOM failed, using Light DOM:', e);
				}
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
			cleanupRef.current = () => {
				cleanupFullscreen();
				cleanupPart();
			};
			// Capture-phase listener on shadow root so we see clicks before Streamdown's button handler.
			const clickHandler = (e: MouseEvent) => {
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

			const app = AppContext.getInstance().app;
			const mouseoverHandler = (e: MouseEvent) => {
				const path = e.composedPath?.() ?? [];
				const link = path.find(
					(n): n is HTMLElement =>
						n instanceof HTMLElement &&
						(n.tagName === 'A' || n.getAttribute?.('data-streamdown') === 'link')
				);
				if (!link) return;
				const href = getWikilinkHref(link);
				if (!href) return;
				const raw = parseWikilinkHrefToPath(href);
				if (!raw || raw.startsWith('#')) return;
				const resolved = resolveWikilinkTargetToPath(raw, app);
				if (!resolved) return;
				const rect = link.getBoundingClientRect();
				if (hoverDebounceRef.current) clearTimeout(hoverDebounceRef.current);
				if (closeDelayRef.current) clearTimeout(closeDelayRef.current);
				closeDelayRef.current = null;
				hoverDebounceRef.current = setTimeout(() => {
					setHoverStateRef.current?.({ path: resolved, rect, preview: null, loading: true });
				}, HOVER_DEBOUNCE_MS);
			};
			const mouseoutHandler = () => {
				if (hoverDebounceRef.current) {
					clearTimeout(hoverDebounceRef.current);
					hoverDebounceRef.current = null;
				}
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
			if (DEBUG) {
				console.log(
					'[StreamdownIsolated] Shadow DOM ready. mode=shadow cssLen=' +
					(typeof STREAMDOWN_ISOLATED_CSS === 'string' ? STREAMDOWN_ISOLATED_CSS.length : 0)
				);
			}
		} catch (e) {
			if (DEBUG) {
				console.warn('[StreamdownIsolated] createRoot failed:', e);
			}
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
					try {
						r.unmount();
					} catch (e) {
						if (DEBUG) console.warn('[StreamdownIsolated] unmount error:', e);
					}
				}, 0);
			}
		};
	}, [useFallback]);

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
			if (DEBUG) {
				console.log(
					'[StreamdownIsolated] Rendered into shadow. childrenLen=' + (children?.length ?? 0)
				);
			}
		}
	}, [children, isAnimating, useFallback]);

	// Load wikilink preview when hover target is set (shadow mode only).
	useEffect(() => {
		if (!hoverState?.path || useFallback) return;
		const path = hoverState.path;
		let cancelled = false;
		const app = AppContext.getInstance().app;
		loadWikilinkPreview(path, app).then((preview) => {
			if (!cancelled)
				setHoverState((prev) => (prev && prev.path === path ? { ...prev, preview, loading: false } : prev));
		});
		return () => {
			cancelled = true;
		};
	}, [hoverState?.path, useFallback]);

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
		if (DEBUG) {
			console.log('[StreamdownIsolated] Using fallback (Light DOM).');
		}
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
				style={{ display: 'block', minHeight: '1em' }}
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
