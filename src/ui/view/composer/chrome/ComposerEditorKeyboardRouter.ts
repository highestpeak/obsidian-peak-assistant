type EditorKeydownHandler = (event: KeyboardEvent) => void;

interface WindowRouter {
	handlers: Map<HTMLElement, EditorKeydownHandler>;
	listener: EditorKeydownHandler;
}

const routers = new WeakMap<Window, WindowRouter>();

/**
 * One capture listener per owner window, regardless of mounted editor count.
 * Active-editor dispatch keeps Obsidian shortcut arbitration without giving
 * every contenteditable its own global listener.
 */
export function registerComposerEditorKeydown(
	element: HTMLElement,
	handler: EditorKeydownHandler,
): () => void {
	const ownerWindow = element.ownerDocument.defaultView;
	if (!ownerWindow) return () => undefined;
	let router = routers.get(ownerWindow);
	if (!router) {
		const handlers = new Map<HTMLElement, EditorKeydownHandler>();
		const listener = (event: KeyboardEvent) => {
			const target = event.target;
			if (!(target instanceof ownerWindow.Node)) return;
			for (const [editor, editorHandler] of handlers) {
				if (target === editor || editor.contains(target)) {
					editorHandler(event);
					return;
				}
			}
		};
		router = { handlers, listener };
		routers.set(ownerWindow, router);
		ownerWindow.addEventListener('keydown', listener, true);
	}
	router.handlers.set(element, handler);
	return () => {
		const active = routers.get(ownerWindow);
		if (!active) return;
		active.handlers.delete(element);
		if (active.handlers.size > 0) return;
		ownerWindow.removeEventListener('keydown', active.listener, true);
		routers.delete(ownerWindow);
	};
}
