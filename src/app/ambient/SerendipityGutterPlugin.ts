// T8: Serendipity gutter extension. Moved out of `src/service/ambient/`
// because the extension owns Obsidian + CodeMirror surfaces (and used
// to reach `(window as any).app` directly). The widget now resolves
// the Ambient runtime through `AppContext.tryGetAmbientRuntime()` and
// opens notes through `AppContext.getApp().workspace.openLinkText`,
// so it never relies on the global `window.app` injection.
//
// The Zustand subscription remains here because the widget reads the
// projected `serendipityItem` directly off the UI store; this is the
// store's read side, not its write side.

import {
	Decoration,
	DecorationSet,
	EditorView,
	ViewPlugin,
	ViewUpdate,
	WidgetType,
} from '@codemirror/view';
import { RangeSetBuilder, type Extension } from '@codemirror/state';
import { useAmbientPushStore } from '@/ui/store/ambientPushStore';
import { AppContext } from '@/app/context/AppContext';
import type { AmbientPushItem } from '@/service/ambient/types';

class SerendipityHintWidget extends WidgetType {
	constructor(private readonly item: AmbientPushItem) {
		super();
	}

	toDOM(): HTMLElement {
		const wrapper = document.createElement('span');
		wrapper.className = 'peak-serendipity-hint';
		wrapper.textContent = '?';
		wrapper.title = '';

		const tooltip = document.createElement('div');
		tooltip.className = 'peak-serendipity-tooltip';
		tooltip.style.display = 'none';

		const title = document.createElement('span');
		title.className = 'peak-serendipity-tooltip-title';
		title.textContent = this.item.title;
		tooltip.appendChild(title);

		const explanation = document.createElement('span');
		explanation.className = 'peak-serendipity-tooltip-explanation';
		explanation.textContent = this.item.explanation;
		tooltip.appendChild(explanation);

		if (this.item.excerpt) {
			const excerpt = document.createElement('span');
			excerpt.className = 'peak-serendipity-tooltip-excerpt';
			excerpt.textContent =
				this.item.excerpt.length > 80
					? `${this.item.excerpt.slice(0, 80)}...`
					: this.item.excerpt;
			tooltip.appendChild(excerpt);
		}

		wrapper.appendChild(tooltip);

		wrapper.addEventListener('mouseenter', () => {
			tooltip.style.display = 'flex';
		});
		wrapper.addEventListener('mouseleave', () => {
			tooltip.style.display = 'none';
		});

		wrapper.addEventListener('click', (e) => {
			e.preventDefault();
			e.stopPropagation();
			const app = AppContext.getApp();
			app.workspace.openLinkText(this.item.filePath, '', true);
			AppContext.tryGetAmbientRuntime()?.recordAction('', this.item.filePath, 'opened');
		});

		return wrapper;
	}

	eq(other: SerendipityHintWidget): boolean {
		return this.item.filePath === other.item.filePath;
	}

	ignoreEvent(): boolean {
		return false;
	}
}

const serendipityPlugin = ViewPlugin.fromClass(
	class {
		decorations: DecorationSet;
		private storeUnsub: (() => void) | null = null;
		private currentItem: AmbientPushItem | null = null;

		constructor(private view: EditorView) {
			this.currentItem = useAmbientPushStore.getState().serendipityItem;
			this.decorations = this.buildDecorations();

			this.storeUnsub = useAmbientPushStore.subscribe((state) => {
				const newItem = state.serendipityItem;
				if (newItem !== this.currentItem) {
					this.currentItem = newItem;
					this.decorations = this.buildDecorations();
					this.view.dispatch({ effects: [] });
				}
			});
		}

		update(update: ViewUpdate) {
			if (update.selectionSet || update.docChanged) {
				this.decorations = this.buildDecorations();
			}
		}

		buildDecorations(): DecorationSet {
			if (!this.currentItem) return Decoration.none;

			const builder = new RangeSetBuilder<Decoration>();
			const cursor = this.view.state.selection.main.head;
			const line = this.view.state.doc.lineAt(cursor);

			builder.add(
				line.to,
				line.to,
				Decoration.widget({
					widget: new SerendipityHintWidget(this.currentItem),
					side: 1,
				}),
			);

			return builder.finish();
		}

		destroy() {
			this.storeUnsub?.();
			this.storeUnsub = null;
		}
	},
	{
		decorations: (v) => v.decorations,
	},
);

export function serendipityGutterExtension(): Extension {
	return [
		serendipityPlugin,
		EditorView.baseTheme({
			'.peak-serendipity-hint': {
				display: 'inline-flex',
				alignItems: 'center',
				justifyContent: 'center',
				width: '18px',
				height: '18px',
				marginLeft: '8px',
				borderRadius: '50%',
				fontSize: '11px',
				fontWeight: '600',
				cursor: 'pointer',
				opacity: '0.5',
				transition: 'opacity 150ms ease',
				color: 'var(--text-accent)',
				backgroundColor: 'color-mix(in srgb, var(--text-accent) 10%, transparent)',
				position: 'relative',
				'&:hover': {
					opacity: '1',
				},
			},
			'.peak-serendipity-tooltip': {
				display: 'none',
				flexDirection: 'column',
				gap: '4px',
				position: 'absolute',
				top: '24px',
				left: '0',
				zIndex: '1000',
				minWidth: '240px',
				maxWidth: '320px',
				padding: '8px 10px',
				borderRadius: '6px',
				fontSize: '12px',
				lineHeight: '1.4',
				boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
				backgroundColor: 'var(--background-primary)',
				border: '1px solid var(--background-modifier-border)',
			},
			'.peak-serendipity-tooltip-title': {
				fontWeight: '600',
				color: 'var(--text-normal)',
			},
			'.peak-serendipity-tooltip-explanation': {
				color: 'var(--text-accent)',
				fontSize: '11px',
			},
			'.peak-serendipity-tooltip-excerpt': {
				color: 'var(--text-muted)',
				fontSize: '11px',
			},
		}),
	];
}
