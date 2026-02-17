/**
 * RAF coalescing for canvas redraws. Avoids multiple draws per frame.
 */

export type DrawScheduler = {
	schedule: () => void;
	cancel: () => void;
};

export function createDrawScheduler(onDraw: () => void): DrawScheduler {
	let raf: number | null = null;

	function schedule() {
		if (raf != null) return;
		raf = requestAnimationFrame(() => {
			raf = null;
			onDraw();
		});
	}

	function cancel() {
		if (raf != null) {
			cancelAnimationFrame(raf);
			raf = null;
		}
	}

	return { schedule, cancel };
}
