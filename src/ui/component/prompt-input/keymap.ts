import { keymap } from "@codemirror/view";
import { Prec } from "@codemirror/state";

// Keyboard handling for CodeMirror
export const keymapExtension = Prec.high(keymap.of([
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
]));