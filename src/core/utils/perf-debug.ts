/**
 * Perf debug: microtask counter + click logger.
 * Helps confirm microtask flood (e.g. 5125 microtasks on single click).
 * Microtasks queued from animation libs (framer-motion / motion) are excluded to avoid false positives.
 * Disable: localStorage.PERF_DEBUG='false'
 */

/** Disable: localStorage.PERF_DEBUG='false'. Otherwise enabled for debugging. */
const ENABLED = typeof window !== 'undefined' && window.localStorage?.getItem('PERF_DEBUG') !== 'false';

let microtaskCount = 0;
let firstOverThresholdStack: string | null = null;
let scheduledLog = false;
const THRESHOLD = 500;

/** Stack substrings that indicate the microtask was queued by animation lib (framer-motion / motion). */
const ANIMATION_STACK_MARKS = ['processBatch', 'MotionValue', 'updateAndNotify', 'tick'];

function isAnimationDrivenStack(stack: string | null): boolean {
	if (!stack) return false;
	return ANIMATION_STACK_MARKS.some((mark) => stack.includes(mark));
}

function logMicrotaskFlood() {
	const count = microtaskCount;
	const stack = firstOverThresholdStack;
	microtaskCount = 0;
	firstOverThresholdStack = null;
	scheduledLog = false;
	console.warn('[PerfDebug] Microtask flood detected', {
		count,
		firstStack: stack ?? undefined,
	});
}

function wrapQueueMicrotask() {
	if (typeof queueMicrotask !== 'function') return;
	const orig = queueMicrotask.bind(window);
	(window as any).queueMicrotask = function (cb: () => void) {
		let stack: string | null = null;
		try {
			stack = new Error().stack ?? null;
		} catch {
			// ignore
		}
		if (isAnimationDrivenStack(stack)) {
			orig(cb);
			return;
		}
		microtaskCount++;
		if (microtaskCount >= THRESHOLD) {
			if (!firstOverThresholdStack) firstOverThresholdStack = stack;
			if (!scheduledLog) {
				scheduledLog = true;
				setTimeout(logMicrotaskFlood, 0);
			}
		}
		orig(cb);
	};
}

/**
 * Call from click handlers to log which path fired.
 */
export function logClick(label: string, detail?: Record<string, unknown>) {
	if (!ENABLED) return;
	const t = performance.now();
	console.log('[PerfDebug] click', { label, ts: Math.round(t), ...detail });
}

/**
 * Call to init microtask counter. Safe to call multiple times.
 */
export function initPerfDebug() {
	if (!ENABLED) return;
	wrapQueueMicrotask();
	console.log('[PerfDebug] microtask counter enabled (threshold=%d)', THRESHOLD);
}
