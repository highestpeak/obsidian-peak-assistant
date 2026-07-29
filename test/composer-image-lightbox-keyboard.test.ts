import { handleLightboxKeyboardEvent } from '../src/ui/view/composer/blocks/image/composerImageLightboxKeyboard';
import { makeChecker } from './helpers/composer-fakes';

const { check, done } = makeChecker();

function runKey(key: string, hasMultiple = true): {
	handled: boolean;
	prevented: boolean;
	stopped: boolean;
	actions: string[];
} {
	let prevented = false;
	let stopped = false;
	const actions: string[] = [];
	const handled = handleLightboxKeyboardEvent(
		{
			key,
			preventDefault: () => {
				prevented = true;
			},
			stopPropagation: () => {
				stopped = true;
			},
		},
		{
			hasMultiple,
			close: () => actions.push('close'),
			previous: () => actions.push('previous'),
			next: () => actions.push('next'),
			zoomIn: () => actions.push('zoomIn'),
			zoomOut: () => actions.push('zoomOut'),
			reset: () => actions.push('reset'),
		},
	);
	return { handled, prevented, stopped, actions };
}

const escape = runKey('Escape');
check(
	'Escape is claimed before host shortcuts and closes the lightbox',
	escape.handled &&
		escape.prevented &&
		escape.stopped &&
		escape.actions.join(',') === 'close',
);

check('ArrowLeft navigates to the previous image', runKey('ArrowLeft').actions[0] === 'previous');
check('ArrowRight navigates to the next image', runKey('ArrowRight').actions[0] === 'next');

const singleImageArrow = runKey('ArrowLeft', false);
check(
	'single-image navigation keys remain unclaimed',
	!singleImageArrow.handled &&
		!singleImageArrow.prevented &&
		!singleImageArrow.stopped &&
		singleImageArrow.actions.length === 0,
);

check('plus zooms in', runKey('+').actions[0] === 'zoomIn');
check('minus zooms out', runKey('-').actions[0] === 'zoomOut');
check('zero resets the view', runKey('0').actions[0] === 'reset');

const unrelated = runKey('a');
check(
	'unrelated keys are not swallowed',
	!unrelated.handled &&
		!unrelated.prevented &&
		!unrelated.stopped &&
		unrelated.actions.length === 0,
);

done('composer-image-lightbox-keyboard');
