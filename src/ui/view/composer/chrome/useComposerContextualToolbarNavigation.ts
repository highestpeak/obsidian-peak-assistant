import * as React from 'react';

const CONTEXTUAL_TOOLBAR_SELECTOR = [
	'[data-composer-contextual-toolbar="block"]',
	'[data-composer-contextual-toolbar="table"]',
	'[data-composer-contextual-toolbar="image"]',
].join(',');

/**
 * Standard editor-to-toolbar bridge for Composer's non-selection chrome.
 * SelectionToolbar owns its stronger source-range bookmark; this bridge owns
 * block/table/image toolbar cycling and exact focus return.
 */
export function useComposerContextualToolbarNavigation(
	rootRef: React.RefObject<HTMLElement | null>,
): void {
	const originRef = React.useRef<HTMLElement | null>(null);

	React.useEffect(() => {
		const root = rootRef.current;
		if (!root) return;
		const onKeyDown = (event: KeyboardEvent): void => {
			if (event.defaultPrevented || event.isComposing || event.key === 'Process') return;
			const target = event.target as HTMLElement | null;
			if (!target || !root.contains(target)) return;

			if (
				event.altKey
				&& !event.ctrlKey
				&& !event.metaKey
				&& !event.shiftKey
				&& event.key === 'F10'
			) {
				// The selection toolbar's document-level listener always gets first
				// refusal. A visible selection toolbar is still an explicit guard here.
				if (visibleToolbar(root.querySelector<HTMLElement>('[data-composer-contextual-toolbar="selection"]'))) {
					return;
				}
				const toolbars = orderedContextualToolbars(root, target);
				if (toolbars.length === 0) return;
				event.preventDefault();
				event.stopPropagation();
				const current = target.closest<HTMLElement>(CONTEXTUAL_TOOLBAR_SELECTOR);
				if (!current) originRef.current = target;
				const currentIndex = current ? toolbars.indexOf(current) : -1;
				const next = toolbars[(currentIndex + 1) % toolbars.length];
				focusToolbar(next);
				return;
			}

			if (event.key !== 'Escape') return;
			const toolbar = target.closest<HTMLElement>(CONTEXTUAL_TOOLBAR_SELECTOR);
			if (!toolbar || !root.contains(toolbar) || toolbarHasOpenChild(toolbar)) return;
			event.preventDefault();
			event.stopPropagation();
			const origin = originRef.current;
			originRef.current = null;
			if (origin?.isConnected) origin.focus({ preventScroll: true });
		};

		root.addEventListener('keydown', onKeyDown, true);
		return () => root.removeEventListener('keydown', onKeyDown, true);
	}, [rootRef]);
}

function orderedContextualToolbars(root: HTMLElement, target: HTMLElement): HTMLElement[] {
	const all = Array.from(root.querySelectorAll<HTMLElement>(CONTEXTUAL_TOOLBAR_SELECTOR))
		.filter(visibleToolbar);
	const activeBlock = target.closest<HTMLElement>('[data-block-id]');
	if (!activeBlock) return all;
	const local = all.filter((toolbar) => activeBlock.contains(toolbar));
	return [...local, ...all.filter((toolbar) => !local.includes(toolbar))];
}

function focusToolbar(toolbar: HTMLElement): void {
	const items = Array.from(toolbar.querySelectorAll<HTMLElement>('button:not([disabled])'))
		.filter((item) => item.closest(CONTEXTUAL_TOOLBAR_SELECTOR) === toolbar)
		.filter(visibleToolbar);
	if (items.length === 0) return;
	const active = items.find((item) => item.tabIndex === 0) ?? items[0];
	for (const item of items) item.tabIndex = item === active ? 0 : -1;
	active.focus({ preventScroll: true });
	active.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

function toolbarHasOpenChild(toolbar: HTMLElement): boolean {
	return Boolean(
		toolbar.querySelector('[aria-expanded="true"]')
		|| toolbar.parentElement?.querySelector('[role="menu"]')
		|| toolbar.closest('[data-floating-surface="true"]'),
	);
}

function visibleToolbar(element: HTMLElement | null): element is HTMLElement {
	if (!element || !element.isConnected || element.hidden || element.closest('[aria-hidden="true"]')) return false;
	const win = element.ownerDocument.defaultView;
	if (!win) return true;
	const style = win.getComputedStyle(element);
	return style.display !== 'none'
		&& style.visibility !== 'hidden'
		&& element.getClientRects().length > 0;
}
