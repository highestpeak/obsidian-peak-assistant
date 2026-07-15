/**
 * File Atlas — host port (UI ↔ app boundary).
 *
 * The panel is framework-agnostic React; anything that touches the Obsidian
 * runtime (revealing a line in the editor, clipboard) is injected as this port
 * and composed at the app layer. File Atlas mounts inside the CopilotPicker
 * modal's Atlas tab, so the port is built in CopilotPickerContent from the
 * `vaultNavigation` service port. Keeps runtime ownership out of the UI layer.
 */

export interface FileAtlasHostPort {
	/** Open the active file and move the editor to `line` (0-based). */
	revealLine(line: number): void | Promise<void>;
	/** Copy text to the clipboard (used by "Copy link"). */
	copyToClipboard(text: string): void | Promise<void>;
	/** Best-effort user notification. */
	notify(message: string): void;
}
