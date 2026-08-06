import assert from 'node:assert/strict';
import { importWithoutMermaidLoadListener } from '@/ui/mermaid/importMermaidModule';

async function main(): Promise<void> {
	const originalWindow = globalThis.window;
	const forwarded: string[] = [];
	const fakeWindow = {
		addEventListener(type: string): void {
			forwarded.push(type);
		},
	} as unknown as Window & typeof globalThis;
	const originalAddEventListener = fakeWindow.addEventListener;
	Object.defineProperty(globalThis, 'window', {
		configurable: true,
		writable: true,
		value: fakeWindow,
	});

	let finishFirst: (() => void) | null = null;
	let secondStarted = false;
	try {
		const first = importWithoutMermaidLoadListener(() => new Promise<string>((resolve) => {
			window.addEventListener('load', function mermaidContentLoaded() {
				console.error('Mermaid failed to initialize');
			});
			window.addEventListener('resize', () => undefined);
			finishFirst = () => resolve('first');
		}));
		const second = importWithoutMermaidLoadListener(async () => {
			secondStarted = true;
			return 'second';
		});

		await Promise.resolve();
		assert.equal(secondStarted, false, 'concurrent guarded imports are serialized');
		assert.deepEqual(forwarded, ['resize'], 'only the Mermaid load listener is suppressed');
		finishFirst?.();
		assert.equal(await first, 'first');
		assert.equal(await second, 'second');
		assert.equal(fakeWindow.addEventListener, originalAddEventListener, 'the global method is restored');
	} finally {
		Object.defineProperty(globalThis, 'window', {
			configurable: true,
			writable: true,
			value: originalWindow,
		});
	}

	console.log('mermaid-module-loader: passed');
}

void main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
