import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

/**
 * Detached-window support for Chat Studio and any UI that can be popped out of
 * the main workspace (§5.3 of the 2026-07-15 Chat Studio spec).
 *
 * Obsidian popout windows have their own `document` and `window`. Attaching a
 * `keydown` / `mousemove` / `resize` listener to the global `window` misses
 * every event fired inside a detached window — the drag stalls, Escape stops
 * closing the menu, `document.activeElement` looks at the wrong document.
 *
 * These helpers resolve the correct owner document/window from a ref so
 * callers can `useOwnerDocumentListener(ref, 'keydown', handler)` and stay
 * detached-window-safe.
 */

/**
 * Resolve the ownerDocument/defaultView pair from a DOM ref. Returns null
 * placeholders when the ref is not yet mounted; the returned function is
 * stable so callers can safely put it inside `useEffect` deps if they wish
 * (though the normal pattern is: read once inside the effect body).
 */
export function ownerDocumentFor(el: Element | null): Document | null {
	return el?.ownerDocument ?? null;
}

export function ownerWindowFor(el: Element | null): (Window & typeof globalThis) | null {
	const doc = el?.ownerDocument;
	if (!doc) return null;
	return (doc.defaultView as (Window & typeof globalThis) | null) ?? null;
}

/**
 * Subscribe to a document-level event on the ref's ownerDocument. Re-binds
 * whenever the ref, event, or capture flag changes. The effect resolves the
 * document lazily so it works when the ref is populated after mount (React
 * refs are set after commit — the effect runs after that).
 */
export function useOwnerDocumentListener<K extends keyof DocumentEventMap>(
	ref: RefObject<Element | null>,
	event: K,
	handler: (ev: DocumentEventMap[K]) => void,
	options?: boolean | AddEventListenerOptions,
) {
	const handlerRef = useRef(handler);
	useEffect(() => { handlerRef.current = handler; }, [handler]);

	useEffect(() => {
		const doc = ref.current?.ownerDocument;
		if (!doc) return;
		const listener = (ev: Event) => handlerRef.current(ev as DocumentEventMap[K]);
		doc.addEventListener(event, listener, options);
		return () => doc.removeEventListener(event, listener, options);
	}, [ref, event, options]);
}

/**
 * Subscribe to a window-level event (resize, focus, blur, visibilitychange…)
 * on the ref's ownerDocument.defaultView. Mirrors `useOwnerDocumentListener`.
 */
export function useOwnerWindowListener<K extends keyof WindowEventMap>(
	ref: RefObject<Element | null>,
	event: K,
	handler: (ev: WindowEventMap[K]) => void,
	options?: boolean | AddEventListenerOptions,
) {
	const handlerRef = useRef(handler);
	useEffect(() => { handlerRef.current = handler; }, [handler]);

	useEffect(() => {
		const win = ownerWindowFor(ref.current);
		if (!win) return;
		const listener = (ev: Event) => handlerRef.current(ev as WindowEventMap[K]);
		win.addEventListener(event, listener, options);
		return () => win.removeEventListener(event, listener, options);
	}, [ref, event, options]);
}

/**
 * Return a `confirm()` bound to the ref's ownerWindow. Falls back to the
 * global `window.confirm` if the ref is unmounted. Callers should treat a
 * missing confirm as "assume yes" — matching the existing composer gate.
 */
export function useOwnerConfirm(ref: RefObject<Element | null>): (message: string) => boolean {
	return useCallback((message: string) => {
		const win = ownerWindowFor(ref.current) ?? (typeof window !== 'undefined' ? window : null);
		if (!win || typeof win.confirm !== 'function') return true;
		return win.confirm(message);
	}, [ref]);
}

/**
 * Track the owner window of a ref. Useful when a hook needs to bind listeners
 * on a target derived from a different element (e.g. a hidden trigger button
 * whose keyboard listener must fire against the popout's window).
 *
 * Returns null until the ref is populated after first commit.
 */
export function useOwnerWindow(
	ref: RefObject<Element | null>,
): (Window & typeof globalThis) | null {
	const [win, setWin] = useState<(Window & typeof globalThis) | null>(null);
	useEffect(() => {
		setWin(ownerWindowFor(ref.current));
	}, [ref]);
	return win;
}
