/**
 * Coalesce an accumulated streaming value to the browser's paint cadence.
 *
 * Provider chunks can arrive much faster than the renderer can paint them.
 * Rendering every chunk makes the candidate body repeatedly reflow and leaves
 * the caret visibly jumpy. This buffer retains the latest accumulated value,
 * paints at most once per animation frame, and still lets a terminal event
 * synchronously replace the streaming body with its review state.
 */

export interface AnimationFrameScheduler {
	request(callback: FrameRequestCallback): number;
	cancel(handle: number): void;
}

export interface StreamingTextFrameBuffer {
	push(text: string): void;
	finish(): void;
	dispose(): void;
}

export function createStreamingTextFrameBuffer(
	commit: (text: string | null) => void,
	scheduler: AnimationFrameScheduler,
): StreamingTextFrameBuffer {
	let latest = '';
	let frame: number | null = null;
	let disposed = false;

	const flush = () => {
		frame = null;
		if (disposed) return;
		commit(latest);
	};

	return {
		push(text) {
			if (disposed) return;
			latest = text;
			if (frame !== null) return;
			frame = scheduler.request(flush);
		},
		finish() {
			if (frame !== null) scheduler.cancel(frame);
			frame = null;
			if (!disposed) commit(null);
		},
		dispose() {
			disposed = true;
			if (frame !== null) scheduler.cancel(frame);
			frame = null;
		},
	};
}
