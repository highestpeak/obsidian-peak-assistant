import { useEffect, useRef, type RefObject } from 'react';

export interface RovingCompositeOptions {
	itemSelector: string;
	enabled?: boolean;
	orientation?: 'vertical' | 'horizontal' | 'both';
	wrap?: boolean;
	pageSize?: number;
	rememberBy?: string;
	onActiveItem?: (item: HTMLElement) => void;
}

export interface RovingKeyIntent {
	kind: 'move' | 'first' | 'last' | 'page' | 'context' | 'none';
	delta?: number;
}

export function resolveRovingKeyIntent(
	key: string,
	orientation: 'vertical' | 'horizontal' | 'both',
	pageSize: number,
): RovingKeyIntent {
	if (key === 'Home') return { kind: 'first' };
	if (key === 'End') return { kind: 'last' };
	if (key === 'PageUp') return { kind: 'page', delta: -pageSize };
	if (key === 'PageDown') return { kind: 'page', delta: pageSize };
	if (key === 'F10') return { kind: 'context' };
	if ((orientation === 'vertical' || orientation === 'both') && key === 'ArrowUp') {
		return { kind: 'move', delta: -1 };
	}
	if ((orientation === 'vertical' || orientation === 'both') && key === 'ArrowDown') {
		return { kind: 'move', delta: 1 };
	}
	if ((orientation === 'horizontal' || orientation === 'both') && key === 'ArrowLeft') {
		return { kind: 'move', delta: -1 };
	}
	if ((orientation === 'horizontal' || orientation === 'both') && key === 'ArrowRight') {
		return { kind: 'move', delta: 1 };
	}
	return { kind: 'none' };
}

function visibleItems(root: HTMLElement, selector: string): HTMLElement[] {
	return Array.from(root.querySelectorAll<HTMLElement>(selector)).filter((item) => {
		if (item.hidden || item.getAttribute('aria-hidden') === 'true') return false;
		if (item.getAttribute('aria-disabled') === 'true' || item.hasAttribute('disabled')) return false;
		const win = item.ownerDocument.defaultView;
		return !win || win.getComputedStyle(item).display !== 'none';
	});
}

function itemIdentity(item: HTMLElement, rememberBy: string): string | null {
	return item.getAttribute(rememberBy)
		?? item.dataset.peakFocusId
		?? item.id
		?? null;
}

export function useRovingComposite(
	rootRef: RefObject<HTMLElement | null>,
	options: RovingCompositeOptions,
): void {
	const optionsRef = useRef(options);
	optionsRef.current = options;
	const activeIdentityRef = useRef<string | null>(null);

	useEffect(() => {
		if (options.enabled === false) return;
		const root = rootRef.current;
		if (!root) return;
		const refresh = (preferred?: HTMLElement | null): HTMLElement | null => {
			const current = optionsRef.current;
			const items = visibleItems(root, current.itemSelector);
			if (items.length === 0) return null;
			const remembered = activeIdentityRef.current
				? items.find((item) =>
					itemIdentity(item, current.rememberBy ?? 'data-peak-focus-id') === activeIdentityRef.current)
				: null;
			const active = preferred && items.includes(preferred)
				? preferred
				: remembered
					?? items.find((item) =>
						item.getAttribute('aria-current') === 'true'
						|| item.getAttribute('aria-selected') === 'true'
						|| item.dataset.selected === 'true')
					?? items.find((item) => item.tabIndex === 0)
					?? items[0];
			for (const item of items) {
				const nextTabIndex = item === active ? 0 : -1;
				if (item.tabIndex !== nextTabIndex) item.tabIndex = nextTabIndex;
			}
			activeIdentityRef.current = itemIdentity(
				active,
				current.rememberBy ?? 'data-peak-focus-id',
			);
			return active;
		};

		refresh();
		const focusItem = (item: HTMLElement): void => {
			refresh(item);
			item.focus({ preventScroll: true });
			item.scrollIntoView({ block: 'nearest', inline: 'nearest' });
			optionsRef.current.onActiveItem?.(item);
		};
		const onFocusIn = (event: FocusEvent): void => {
			const item = (event.target as HTMLElement | null)?.closest<HTMLElement>(
				optionsRef.current.itemSelector,
			);
			if (item && root.contains(item)) refresh(item);
		};
		const onPointerDown = (event: PointerEvent): void => {
			const item = (event.target as HTMLElement | null)?.closest<HTMLElement>(
				optionsRef.current.itemSelector,
			);
			if (item && root.contains(item)) refresh(item);
		};
		const onKeyDown = (event: KeyboardEvent): void => {
			const current = optionsRef.current;
			const item = (event.target as HTMLElement | null)?.closest<HTMLElement>(
				current.itemSelector,
			);
			if (!item || !root.contains(item)) return;
			const intent = resolveRovingKeyIntent(
				event.key,
				current.orientation ?? 'vertical',
				current.pageSize ?? 5,
			);
			if (intent.kind === 'none') return;
			if (intent.kind === 'context') {
				if (!event.shiftKey) return;
				event.preventDefault();
				const MouseEventCtor = item.ownerDocument.defaultView?.MouseEvent;
				if (!MouseEventCtor) return;
				item.dispatchEvent(new MouseEventCtor('contextmenu', {
					bubbles: true,
					cancelable: true,
					view: item.ownerDocument.defaultView ?? undefined,
				}));
				return;
			}
			const items = visibleItems(root, current.itemSelector);
			if (items.length === 0) return;
			const index = Math.max(0, items.indexOf(item));
			let nextIndex = index;
			if (intent.kind === 'first') nextIndex = 0;
			if (intent.kind === 'last') nextIndex = items.length - 1;
			if (intent.kind === 'move' || intent.kind === 'page') {
				nextIndex = index + (intent.delta ?? 0);
				if (current.wrap !== false && intent.kind === 'move') {
					nextIndex = (nextIndex + items.length) % items.length;
				} else {
					nextIndex = Math.max(0, Math.min(items.length - 1, nextIndex));
				}
			}
			event.preventDefault();
			event.stopPropagation();
			focusItem(items[nextIndex]);
		};
		const MutationObserverCtor = root.ownerDocument.defaultView?.MutationObserver;
		const observer = MutationObserverCtor
			? new MutationObserverCtor(() => refresh())
			: null;
		observer?.observe(root, {
			attributes: true,
			attributeFilter: [
				'aria-current',
				'aria-disabled',
				'aria-selected',
				'data-selected',
				'disabled',
				'hidden',
				'tabindex',
			],
			childList: true,
			subtree: true,
		});
		root.addEventListener('focusin', onFocusIn);
		root.addEventListener('pointerdown', onPointerDown);
		root.addEventListener('keydown', onKeyDown, true);
		return () => {
			observer?.disconnect();
			root.removeEventListener('focusin', onFocusIn);
			root.removeEventListener('pointerdown', onPointerDown);
			root.removeEventListener('keydown', onKeyDown, true);
		};
	}, [rootRef, options.enabled]);
}
