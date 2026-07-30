import { MarkdownView } from 'obsidian';
import type { DocumentSourceLocation } from '@/core/ports/VaultNavigationPort';

const DOCUMENT_REVEAL_FLASH_CLASS = 'pk-document-reveal-flash';
const flashCleanup = new WeakMap<HTMLElement, () => void>();

/** Reveal one source line in an already-mounted native Markdown editor. */
export function revealMarkdownLocation(
	view: MarkdownView,
	location: DocumentSourceLocation,
): boolean {
	const editor = view.editor;
	if (!editor) return false;
	const safeLine = Math.max(0, Math.min(location.line, Math.max(0, editor.lineCount() - 1)));
	editor.setCursor({ line: safeLine, ch: 0 });
	editor.scrollIntoView(
		{ from: { line: safeLine, ch: 0 }, to: { line: safeLine, ch: 0 } },
		true,
	);
	editor.focus();
	flashMarkdownActiveLine(view);
	return true;
}

function flashMarkdownActiveLine(view: MarkdownView): void {
	const win = view.containerEl.ownerDocument.defaultView;
	if (!win) return;
	win.requestAnimationFrame(() => {
		win.requestAnimationFrame(() => {
			const activeLine = view.containerEl.querySelector<HTMLElement>('.cm-line.cm-activeLine');
			if (!activeLine) return;
			flashCleanup.get(activeLine)?.();
			activeLine.classList.remove(DOCUMENT_REVEAL_FLASH_CLASS);
			void activeLine.offsetWidth;
			const cleanup = () => {
				activeLine.classList.remove(DOCUMENT_REVEAL_FLASH_CLASS);
				activeLine.removeEventListener('animationend', cleanup);
				flashCleanup.delete(activeLine);
			};
			flashCleanup.set(activeLine, cleanup);
			activeLine.addEventListener('animationend', cleanup);
			activeLine.classList.add(DOCUMENT_REVEAL_FLASH_CLASS);
		});
	});
}
