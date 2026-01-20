/**
 * Stopwatch utility for measuring and logging elapsed time with labeled segments.
 * 
 * Usage:
 * ```typescript
 * const sw = new Stopwatch('Operation');
 * sw.start('step1');
 * // ... do work ...
 * sw.stop();
 * sw.start('step2');
 * // ... do work ...
 * sw.stop();
 * sw.print(); // Prints all segments with timing information
 * ```
 */
export class Stopwatch {
	private segments: Array<{ label: string; startTime: number; endTime?: number; duration?: number; details?: Array<{ label: string; duration: number }> }> = [];
	private currentSegment: { label: string; startTime: number; details?: Array<{ label: string; duration: number }> } | null = null;
	private readonly name: string;

	constructor(name: string = 'Stopwatch') {
		this.name = name;
	}

	/**
	 * Start a new timing segment with the given label.
	 * If a segment is already running, it will be stopped first.
	 */
	start(label: string): void {
		// Stop current segment if running
		if (this.currentSegment) {
			this.stop();
		}

		const startTime = Date.now();
		this.currentSegment = { label, startTime, details: [] };
	}

	/**
	 * add to current segment.
	 */
	addSegmentDetail(label: string, duration: number): void {
		if (!this.currentSegment) {
			return;
		}
		this.currentSegment.details?.push({ label, duration });
	}

	/**
	 * Stop the current timing segment.
	 * If no segment is running, this is a no-op.
	 */
	stop(): void {
		if (!this.currentSegment) {
			return;
		}

		const endTime = Date.now();
		const duration = endTime - this.currentSegment.startTime;
		this.segments.push({
			label: this.currentSegment.label,
			startTime: this.currentSegment.startTime,
			endTime,
			duration,
			details: this.currentSegment.details,
		});

		this.currentSegment = null;
	}

	/**
	 * Get the total elapsed time from the first segment start to now (or last segment end).
	 */
	getTotalElapsed(): number {
		if (this.segments.length === 0) {
			return 0;
		}

		const firstStart = this.segments[0].startTime;
		const lastEnd = this.currentSegment
			? Date.now()
			: (this.segments[this.segments.length - 1].endTime ?? Date.now());

		return lastEnd - firstStart;
	}

	/**
	 * Print all timing segments to console.
	 * Format: [Stopwatch: name] label: duration ms (total: X ms)
	 */
	print(debug: boolean = true): void {
		const total = this.getTotalElapsed();
		const lines: string[] = [];

		lines.push(`[${this.name}] Total: ${total.toFixed(2)} ms`);

		for (const segment of this.segments) {
			const duration = segment.duration ?? 0;
			lines.push(`  - ${segment.label}: ${duration.toFixed(2)} ms`);
			if (segment.details) {
				for (const detail of segment.details) {
					lines.push(`    - ${detail.label}: ${detail.duration.toFixed(2)} ms`);
				}
			}
		}

		// If there's a current running segment, show it
		if (this.currentSegment) {
			const runningDuration = Date.now() - this.currentSegment.startTime;
			lines.push(`  - ${this.currentSegment.label}: ${runningDuration.toFixed(2)} ms (running)`);
			if (this.currentSegment.details) {
				for (const detail of this.currentSegment.details) {
					lines.push(`    - ${detail.label}: ${detail.duration.toFixed(2)} ms`);
				}
			}
		}

		if (debug) {
			console.debug(lines.join('\n'));
		} else {
			console.log(lines.join('\n'));
		}
	}

	/**
	 * Get a formatted string with all timing information.
	 */
	toString(): string {
		const total = this.getTotalElapsed();
		const lines: string[] = [];

		lines.push(`[${this.name}] Total: ${total.toFixed(2)} ms`);

		for (const segment of this.segments) {
			const duration = segment.duration ?? 0;
			lines.push(`  - ${segment.label}: ${duration.toFixed(2)} ms`);
		}

		if (this.currentSegment) {
			const runningDuration = Date.now() - this.currentSegment.startTime;
			lines.push(`  - ${this.currentSegment.label}: ${runningDuration.toFixed(2)} ms (running)`);
		}

		return lines.join('\n');
	}

	/**
	 * Reset the stopwatch, clearing all segments.
	 */
	reset(): void {
		this.segments = [];
		this.currentSegment = null;
	}
}
