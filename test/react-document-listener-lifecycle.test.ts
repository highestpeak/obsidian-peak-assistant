import assert from 'node:assert/strict';
import type { Root } from 'react-dom/client';
import {
	clearReactDocumentListenersForUnload,
	createTrackedRoot,
} from '@/ui/react/ReactRenderer';

function main(): void {
	const selectionListener: EventListener = () => undefined;
	const keyListener: EventListener = () => undefined;
	const removed: Array<{
		type: string;
		listener: EventListenerOrEventListenerObject;
		capture: boolean;
	}> = [];
	const doc = {
		addEventListener(): void {},
		removeEventListener(
			type: string,
			listener: EventListenerOrEventListenerObject,
			options?: boolean | EventListenerOptions,
		): void {
			removed.push({
				type,
				listener,
				capture: typeof options === 'boolean' ? options : Boolean(options?.capture),
			});
		},
	} as unknown as Document;
	const originalAddEventListener = doc.addEventListener;
	const container = { ownerDocument: doc } as unknown as Element;
	const root = { unmount: () => undefined } as unknown as Root;

	const created = createTrackedRoot(container, (() => {
		doc.addEventListener('selectionchange', selectionListener, true);
		doc.addEventListener('keydown', keyListener, false);
		return root;
	}) as never);

	assert.equal(created, root);
	assert.equal(doc.addEventListener, originalAddEventListener, 'the document method is restored immediately');

	clearReactDocumentListenersForUnload();
	clearReactDocumentListenersForUnload();

	assert.deepEqual(removed, [{
		type: 'selectionchange',
		listener: selectionListener,
		capture: true,
	}], 'unload removes only the React document listener exactly once');
	console.log('react-document-listener-lifecycle: passed');
}

main();
