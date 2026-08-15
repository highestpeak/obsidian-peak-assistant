import fs from 'fs';

const editor = fs.readFileSync(
	'src/ui/view/composer/chrome/MarkdownSourceEditor.tsx',
	'utf8',
);
const router = fs.readFileSync(
	'src/ui/view/composer/chrome/ComposerEditorKeyboardRouter.ts',
	'utf8',
);

if (!editor.includes('registerComposerEditorKeydown(el, capture)')) {
	throw new Error('MarkdownSourceEditor must register through the shared keyboard router');
}
if (/win\.addEventListener\('keydown', capture/.test(editor)) {
	throw new Error('MarkdownSourceEditor cannot install one window listener per editor');
}
if (!router.includes("ownerWindow.addEventListener('keydown', listener, true)")) {
	throw new Error('shared router must retain capture-phase Obsidian shortcut arbitration');
}
if (!router.includes('active.handlers.size > 0')) {
	throw new Error('shared router must release its owner-window listener when the last editor unmounts');
}

console.log('composer-editor-keyboard-router: passed');
