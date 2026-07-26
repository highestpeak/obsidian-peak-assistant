/**
 * Peak Composer — clipboard image detection (WP7 integration).
 *
 * Pure-logic coverage of `firstClipboardImage` / `isImagePasteItem`: the branch
 * the chrome's onPaste uses to route a pasted bitmap to the image coordinator
 * (vs. the native text/URL path). No DOM — fake clipboard item lists stand in for
 * a real `DataTransferItemList`, exactly the surface the detector reads.
 */

import {
	firstClipboardImage,
	isImagePasteItem,
	type PasteFileLike,
	type PasteItemLike,
} from '@/ui/view/composer/chrome/pasteImage';

let failures = 0;
let count = 0;
function check(name: string, cond: boolean, detail = ''): void {
	count += 1;
	if (cond) return;
	failures += 1;
	console.error(`  XX ${name}${detail ? ' — ' + detail : ''}`);
}

function fileItem(type: string, file: PasteFileLike | null): PasteItemLike {
	return { kind: 'file', type, getAsFile: () => file };
}
function stringItem(type: string): PasteItemLike {
	return { kind: 'string', type, getAsFile: () => null };
}
function file(type: string, name?: string): PasteFileLike {
	return name !== undefined ? { type, name } : { type };
}

function main(): void {
	// ── isImagePasteItem ──────────────────────────────────────────────────────
	check('image/png file item is an image', isImagePasteItem(fileItem('image/png', file('image/png'))));
	check('image/jpeg file item is an image', isImagePasteItem(fileItem('image/jpeg', file('image/jpeg'))));
	check('text/plain string item is NOT an image', !isImagePasteItem(stringItem('text/plain')));
	check('text/uri-list string item is NOT an image', !isImagePasteItem(stringItem('text/uri-list')));
	// A file-kind item that is not an image (e.g. a pasted PDF) is not a bitmap.
	check('application/pdf file item is NOT an image', !isImagePasteItem(fileItem('application/pdf', file('application/pdf'))));
	// kind must be 'file' even if the type says image (paranoia against odd hosts).
	check('image type but string kind is NOT an image', !isImagePasteItem({ kind: 'string', type: 'image/png', getAsFile: () => null }));

	// ── firstClipboardImage ───────────────────────────────────────────────────
	check('null items → null', firstClipboardImage(null) === null);
	check('empty list → null', firstClipboardImage([]) === null);
	check('text-only paste → null (native path preserved)', firstClipboardImage([stringItem('text/plain')]) === null);

	// A real screenshot paste: Chrome delivers a text/html item AND an image file.
	const mixed = firstClipboardImage([stringItem('text/html'), fileItem('image/png', file('image/png', 'Pasted image.png'))]);
	check('mixed text+image paste → the image file', mixed !== null && mixed.mimeType === 'image/png');
	check('mixed paste → filename carried', mixed?.file.name === 'Pasted image.png');

	// First image wins when several are present.
	const first = firstClipboardImage([fileItem('image/webp', file('image/webp', 'a.webp')), fileItem('image/png', file('image/png', 'b.png'))]);
	check('first image wins', first?.mimeType === 'image/webp' && first?.file.name === 'a.webp');

	// An image-kind item whose getAsFile returns null is skipped (no crash).
	check('image item with null file → skipped', firstClipboardImage([fileItem('image/png', null)]) === null);

	console.log(`composer-paste-image: ${count - failures}/${count} checks passed`);
	if (failures > 0) throw new Error(`${failures} check(s) failed`);
}

main();
