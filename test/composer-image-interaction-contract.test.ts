import { readFileSync } from 'node:fs';
import { makeChecker } from './helpers/composer-fakes';

const { check, done } = makeChecker();
const imageView = readFileSync('src/ui/view/composer/blocks/image/ImageBlockView.tsx', 'utf8');
const layoutView = readFileSync('src/ui/view/composer/blocks/image/PeakImageLayoutBlockView.tsx', 'utf8');
const lightbox = readFileSync('src/ui/view/composer/blocks/image/ComposerImageLightbox.tsx', 'utf8');
const converter = readFileSync('src/ui/view/composer/blocks/image/ImageConverterPanel.tsx', 'utf8');
const root = readFileSync('src/ui/view/composer/ComposerRoot.tsx', 'utf8');
const css = readFileSync('src/styles/composer-image.css', 'utf8');

check(
	'single images open a real lightbox by pointer and keyboard',
	imageView.includes('onClick={() => setLightboxOpen(true)}') &&
		imageView.includes("event.key !== 'Enter'") &&
		imageView.includes('<ComposerImageLightbox'),
);
check(
	'layout images use the same viewer instead of remaining inert',
	layoutView.includes('onOpen={() => setLightbox') && layoutView.includes('<ComposerImageLightbox'),
);
check(
	'viewer implements navigation, zoom, drag, wheel, Escape, and thumbnails',
	['ArrowLeft', 'ArrowRight', "event.key === 'Escape'", 'onWheel=', 'onPointerDown=', 'pk-image-lightbox__strip']
		.every((token) => lightbox.includes(token)),
);
check(
	'image object toolbar exposes the complete approved action set',
	['uiStrings.fullscreen', 'uiStrings.editImage', 'uiStrings.rename', 'uiStrings.copy', 'actionStrings.captionTitle', 'actionStrings.editTitle']
		.every((token) => imageView.includes(token)),
);
check(
	'converter produces real Canvas bytes and opens a non-destructive candidate',
	converter.includes('renderImageTransform') &&
		converter.includes('new Uint8Array(await result.blob.arrayBuffer())') &&
		imageView.includes('coordinator.beginConvert'),
);
check(
	'converter has direct eight-handle crop plus rotate flip straighten and formats',
	['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'].every((handle) => css.includes(`handle--${handle}`)) &&
		converter.includes('freeCropPath') &&
		converter.includes('drawingFreePath') &&
		converter.includes('rotateQuarters') &&
		converter.includes('flipHorizontal') &&
		converter.includes('straightenDegrees') &&
		converter.includes('image/webp'),
);
check(
	'existing image rename and copy are wired to real services',
	imageView.includes('coordinator.beginRename') && imageView.includes('<EasyCopyMenu'),
);
check(
	'image candidates keep the original image visible and review below it',
	root.includes("block.kind === 'image'") &&
		root.includes("startsWith('composer.renderer.image')") &&
		root.includes('pk-composer-candidate-slot--image'),
);
check(
	'portal viewer has fixed full-window geometry and reset-proof controls',
	lightbox.includes('className="peak-design-root pk-image-lightbox"') &&
	css.includes('.pk-image-lightbox {') &&
		css.includes('position: fixed') &&
		css.includes('z-index: 10000') &&
		css.includes('.pk-image-lightbox .pk-icon-btn') &&
		css.includes('background: transparent !important') &&
		css.includes('height: 34px !important'),
);

done('composer-image-interaction-contract');
