function isMermaidLoadListener(listener: EventListenerOrEventListenerObject | null): boolean {
	if (typeof listener === 'function') {
		return String(listener).includes('Mermaid failed to initialize');
	}
	return Boolean(
		listener
		&& typeof listener.handleEvent === 'function'
		&& String(listener.handleEvent).includes('Mermaid failed to initialize'),
	);
}

let importQueue: Promise<void> = Promise.resolve();

/**
 * Mermaid installs a permanent window.load listener while its module evaluates,
 * even when callers later initialize it with startOnLoad=false. Suppress only
 * that known listener and forward every other registration unchanged.
 */
export function importWithoutMermaidLoadListener<T>(loader: () => Promise<T>): Promise<T> {
	const run = () => runWithoutMermaidLoadListener(loader);
	const result = importQueue.then(run, run);
	importQueue = result.then(() => undefined, () => undefined);
	return result;
}

async function runWithoutMermaidLoadListener<T>(loader: () => Promise<T>): Promise<T> {
	if (typeof window === 'undefined') return loader();
	const originalAddEventListener = window.addEventListener;
	const guardedAddEventListener = function (
		this: Window,
		type: string,
		listener: EventListenerOrEventListenerObject | null,
		options?: boolean | AddEventListenerOptions,
	): void {
		if (type === 'load' && isMermaidLoadListener(listener)) return;
		originalAddEventListener.call(this, type, listener, options);
	} as typeof window.addEventListener;
	window.addEventListener = guardedAddEventListener;
	try {
		return await loader();
	} finally {
		if (window.addEventListener === guardedAddEventListener) {
			window.addEventListener = originalAddEventListener;
		}
	}
}
