import { readFileSync } from 'node:fs';
import { makeChecker } from './helpers/composer-fakes';

const { check, done } = makeChecker();
const css = readFileSync('src/styles/composer-image.css', 'utf8');
const imageView = readFileSync('src/ui/view/composer/blocks/image/ImageBlockView.tsx', 'utf8');
const layoutView = readFileSync('src/ui/view/composer/blocks/image/PeakImageLayoutBlockView.tsx', 'utf8');
const root = readFileSync('src/ui/view/composer/ComposerRoot.tsx', 'utf8');

check('single image is an actual bordered frame with reference max-height and cover', css.includes('.real-image-frame') && css.includes('max-height: 390px') && css.includes('object-fit: cover'));
check('single-image hover toolbar remains owned by the frame and focusable', css.includes('.real-image-frame:hover > .image-toolbar') && css.includes('.real-image-frame:focus-within > .image-toolbar'));
check('image caption matches reference padding and typography', css.includes('padding: 10px 12px') && css.includes('font-size: 12px') && css.includes('line-height: 1.5'));
check('hero layout uses the reference grid geometry', css.includes('repeat(3, 104px) / minmax(0, 1.65fr) minmax(170px, 0.8fr)') && css.includes('grid-row: 1 / 4'));
check('all four source-backed layout modes are styled', ['grid', 'hero', 'strip', 'story'].every((mode) => css.includes(`data-layout="${mode}"`)));
check('mode toggles and hover controls have the reference 26px and 28px rungs', css.includes('height: 26px !important') && css.includes('height: 28px !important'));
check('root passes editing through to rich block dispatch', root.includes('<BlockKindView block={block} editing={editing} />'));
check('image view carries the parsed width without merging adjacent prose', imageView.includes('style={width ? { width: `${width}px`, maxWidth: \'100%\' } : undefined}'));
check('image view roots are block containers so figure/input children are never reparented', imageView.includes('<div className="pk-composer-image-block'));
check('layout root is a block container around shell and figure grid', layoutView.includes('<div className="pk-composer-image-layout"'));
done('composer-image-parity-style');
