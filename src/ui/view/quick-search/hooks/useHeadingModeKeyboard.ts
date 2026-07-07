/**
 * T5 (2026-07-07 heading-mode UI): keyboard handler for the two-zone
 * heading-mode surface.
 *
 * Focus contract (spec §Selection And Detail Pane):
 *  - `focus === 'tree'`: Up/Down move the active row inside the outline,
 *    Left/Right collapse/expand a subtree, Enter opens the active
 *    heading at its line, Tab shifts focus to the detail pane.
 *  - `focus === 'detail'`: Up/Down cycle through the active section's
 *    snippets, Enter opens the selected snippet at its line, Tab shifts
 *    focus back to the tree.
 *
 * The hook installs a single `keydown` listener on `window` (matching
 * the pattern the main tab already uses) and shortcuts every event
 * when the current mode isn't `heading` OR the target is inside a
 * text input other than the query input. The consumer wires up the
 * open callbacks so this hook stays framework-free.
 */
import { useEffect } from 'react';

export type HeadingFocusZone = 'tree' | 'detail';

export interface HeadingKeyboardHandlers {
	/** Active row index (within the flattened tree) or -1 when nothing active. */
	activeRowIndex: number;
	/** Number of visible rows in the (currently flattened) tree. */
	rowCount: number;
	/** Number of snippets currently in the detail pane. */
	snippetCount: number;
	/** Active snippet index or -1 when nothing focused. */
	activeSnippetIndex: number;

	focus: HeadingFocusZone;
	setFocus: (zone: HeadingFocusZone) => void;

	moveActiveRow: (delta: 1 | -1) => void;
	toggleActiveRow: (op: 'collapse' | 'expand') => void;
	openActiveHeading: () => void;

	moveActiveSnippet: (delta: 1 | -1) => void;
	openActiveSnippet: () => void;
}

interface UseHeadingModeKeyboardOptions {
	enabled: boolean;
	handlers: HeadingKeyboardHandlers;
}

export function useHeadingModeKeyboard({ enabled, handlers }: UseHeadingModeKeyboardOptions): void {
	useEffect(() => {
		if (!enabled) return;

		const listener = (e: KeyboardEvent): void => {
			// Ignore typing in the query input for character keys, but keep
			// navigation keys hot even when the query input has focus (the
			// user needs to steer the tree while still typing the query).
			const target = e.target;
			const isInText = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
			const isNav = e.key === 'ArrowUp' || e.key === 'ArrowDown'
				|| e.key === 'ArrowLeft' || e.key === 'ArrowRight'
				|| e.key === 'Enter' || e.key === 'Tab';
			if (isInText && !isNav) return;

			// Tab always switches focus zone between tree and detail.
			if (e.key === 'Tab') {
				// Skip if a modifier is present (browser tab-switch etc.).
				if (e.metaKey || e.ctrlKey || e.altKey) return;
				e.preventDefault();
				e.stopPropagation();
				handlers.setFocus(handlers.focus === 'tree' ? 'detail' : 'tree');
				return;
			}

			if (handlers.focus === 'detail') {
				if (handlers.snippetCount === 0) return;
				switch (e.key) {
					case 'ArrowDown':
						e.preventDefault();
						e.stopPropagation();
						handlers.moveActiveSnippet(1);
						return;
					case 'ArrowUp':
						e.preventDefault();
						e.stopPropagation();
						handlers.moveActiveSnippet(-1);
						return;
					case 'Enter':
						e.preventDefault();
						e.stopPropagation();
						handlers.openActiveSnippet();
						return;
				}
				return;
			}

			// focus === 'tree'
			switch (e.key) {
				case 'ArrowDown':
					if (handlers.rowCount === 0) return;
					e.preventDefault();
					e.stopPropagation();
					handlers.moveActiveRow(1);
					return;
				case 'ArrowUp':
					if (handlers.rowCount === 0) return;
					e.preventDefault();
					e.stopPropagation();
					handlers.moveActiveRow(-1);
					return;
				case 'ArrowLeft':
					if (handlers.activeRowIndex < 0) return;
					e.preventDefault();
					e.stopPropagation();
					handlers.toggleActiveRow('collapse');
					return;
				case 'ArrowRight':
					if (handlers.activeRowIndex < 0) return;
					e.preventDefault();
					e.stopPropagation();
					handlers.toggleActiveRow('expand');
					return;
				case 'Enter':
					if (handlers.activeRowIndex < 0) return;
					e.preventDefault();
					e.stopPropagation();
					handlers.openActiveHeading();
					return;
			}
		};

		// `capture: true` — heading-mode's arrow / enter behavior overrides
		// the tab-VaultSearch top-level handler for the same events. The
		// tab-level handler bails out when the current mode is `heading`
		// anyway (see the container wiring).
		window.addEventListener('keydown', listener, { capture: true });
		return () => window.removeEventListener('keydown', listener, { capture: true } as EventListenerOptions);
	}, [enabled, handlers]);
}
