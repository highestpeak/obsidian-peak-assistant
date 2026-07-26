/**
 * Peak Composer — clipboard image detection (WP7 integration).
 *
 * Pure, DOM-free classification of a paste's clipboard items: is there a bitmap
 * file (an actual `image/*` File, NOT a text/URL paste)? The chrome's `onPaste`
 * uses this to decide between the native text path and the image coordinator's
 * atomic paste transaction. Kept pure so the branch is unit-testable without a
 * real ClipboardEvent — the handler layers the async `arrayBuffer()` read on top.
 */

/** Minimal structural view of a clipboard `File` (only what detection reads). */
export interface PasteFileLike {
	readonly type: string;
	readonly name?: string;
}

/** Minimal structural view of a `DataTransferItem`. */
export interface PasteItemLike {
	readonly kind: string;
	readonly type: string;
	getAsFile(): PasteFileLike | null;
}

/** True for an `image/*` clipboard item backed by a real file (a pasted bitmap). */
export function isImagePasteItem(item: PasteItemLike): boolean {
	if (item.kind !== 'file') return false;
	return /^image\//i.test(item.type);
}

/**
 * The first pasted bitmap file in a clipboard item list, or null when the paste
 * carries no image file (ordinary text / URL / html paste). Iterating the list
 * (rather than trusting `files`) keeps mixed text+image pastes working and stays
 * portable to the fake item arrays the unit test drives.
 */
export function firstClipboardImage(items: ArrayLike<PasteItemLike> | null | undefined): {
	file: PasteFileLike;
	mimeType: string;
} | null {
	if (!items) return null;
	for (let i = 0; i < items.length; i++) {
		const item = items[i];
		if (!isImagePasteItem(item)) continue;
		const file = item.getAsFile();
		if (file) return { file, mimeType: file.type };
	}
	return null;
}
