import { keymap } from "@codemirror/view";
import { Prec } from "@codemirror/state";
import { cursorGroupLeft, cursorGroupRight, selectGroupLeft, selectGroupRight } from "@codemirror/commands";

// Keyboard handling for CodeMirror
export const keymapExtension = Prec.highest(keymap.of([
	{
		key: "Enter",
		run: (view) => {
			// Check if there's an active NavigableMenu (dropdown menu)
			const activeMenu = document.querySelector('[data-item-id]');
			if (activeMenu) {
				// Let the menu handle the Enter key
				return false;
			}

			// Check if submit button is disabled
			const form = view.dom.closest('form');
			const submitButton = form?.querySelector('button[type="submit"]') as HTMLButtonElement | null;
			if (submitButton?.disabled) {
				return false;
			}

			// Submit the form
			form?.requestSubmit();
			return true;
		}
	},
	{
		key: "Shift-Enter",
		run: () => {
			// Allow Shift+Enter for new line
			return false;
		}
	},
	{
		key: "Backspace",
		run: (view) => {
			// Backspace to remove last attachment when editor is empty
			if (view.state.doc.length === 0) {
				// This will be handled by the React component
				return false;
			}
			return false;
		}
	},

	// Word navigation — explicitly handle so Obsidian global shortcuts don't intercept
	{ key: "Ctrl-ArrowLeft", run: cursorGroupLeft },
	{ key: "Ctrl-ArrowRight", run: cursorGroupRight },
	{ key: "Ctrl-Shift-ArrowLeft", run: selectGroupLeft },
	{ key: "Ctrl-Shift-ArrowRight", run: selectGroupRight },
	// Mac uses Alt for word navigation
	{ key: "Alt-ArrowLeft", run: cursorGroupLeft },
	{ key: "Alt-ArrowRight", run: cursorGroupRight },
	{ key: "Alt-Shift-ArrowLeft", run: selectGroupLeft },
	{ key: "Alt-Shift-ArrowRight", run: selectGroupRight },
]));