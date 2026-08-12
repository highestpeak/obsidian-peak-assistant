import type {
	ProgressHandle,
	ProgressReporterPort,
} from '@/core/ports/ProgressReporterPort';

/** Progress tracker for indexing operations with periodic updates and final statistics. */
export class IndexProgressTracker {
	private handle: ProgressHandle | null = null;
	private readonly reporter: ProgressReporterPort;
	private readonly totalFiles: number | null;
	private startTime: number | null = null;
	private cancelled = false;

	constructor(reporter: ProgressReporterPort, totalFiles?: number) {
		this.totalFiles = totalFiles ?? null;
		this.reporter = reporter;
	}

	showStart(customMessage?: string): void {
		this.handle = this.reporter.show(customMessage || 'Building search index...', 0);
		this.startTime = Date.now();
		this.cancelled = false;
	}

	cancel(): void {
		this.cancelled = true;
		if (this.handle) {
			this.handle.hide();
			this.handle = this.reporter.show('Indexing cancelled', 3000);
		}
	}

	isCancelled(): boolean { return this.cancelled; }

	dismiss(): void {
		if (this.handle) { this.handle.hide(); this.handle = null; }
	}

	updateProgress(currentCount: number, currentPath?: string): void {
		if (!this.handle) return;
		const elapsedMs = this.startTime ? Date.now() - this.startTime : 0;
		const elapsed = this.formatDuration(elapsedMs);

		let message: string;
		if (this.totalFiles !== null && this.totalFiles > 0) {
			const pct = Math.round((currentCount / this.totalFiles) * 100);
			let remaining = '';
			if (currentCount > 0 && currentCount < this.totalFiles) {
				remaining = `, ~${this.formatDuration((elapsedMs / currentCount) * (this.totalFiles - currentCount))} remaining`;
			}
			message = `Indexing: ${currentCount}/${this.totalFiles} files (${pct}%) - ${elapsed} elapsed${remaining}`;
		} else {
			message = `Indexing: ${currentCount} files processed... - ${elapsed} elapsed`;
		}
		this.handle.setMessage(currentPath ? `${message}\n${currentPath}` : message);
	}

	recordFailure(stage: string, message: string, path?: string): void {
		this.reporter.recordFailure?.({ stage, path, message });
	}

	showComplete(stats: Record<string, any>): void {
		this.handle?.hide();
		const finalStats = { ...stats };
		if (finalStats.duration === undefined && this.startTime !== null) finalStats.duration = Date.now() - this.startTime;

		const formatters: Record<string, (v: any) => string> = {
			duration: (ms: number) => this.formatDuration(ms),
			storageSize: (b: number) => this.formatBytes(b),
			memoryDelta: (mb: number) => `${mb >= 0 ? '+' : ''}${this.formatMemory(Math.abs(mb))}`,
		};
		const labels: Record<string, string> = { totalIndexed: 'Documents', duration: 'Duration', storageSize: 'Storage', memoryDelta: 'Memory' };

		const lines = Object.entries(finalStats)
			.filter(([, v]) => v != null)
			.map(([k, v]) => `${labels[k] ?? k.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase()).trim()}: ${formatters[k] ? formatters[k](v) : String(v)}`);
		this.handle = this.reporter.show(`Indexing complete!\n${lines.join('\n')}`, 8000);
	}

	showError(errorMessage: string): void {
		this.handle?.hide();
		this.handle = this.reporter.show(`Indexing failed: ${errorMessage}`, 5000);
	}

	private formatDuration(ms: number): string {
		if (ms < 1000) return `${ms}ms`;
		const s = Math.floor(ms / 1000);
		if (s < 60) return `${s}s`;
		const m = Math.floor(s / 60), rs = s % 60;
		if (m < 60) return rs > 0 ? `${m}m ${rs}s` : `${m}m`;
		const h = Math.floor(m / 60), rm = m % 60;
		return rm > 0 ? `${h}h ${rm}m` : `${h}h`;
	}

	private formatMemory(mb: number): string {
		if (mb < 1) return `${Math.round(mb * 1024)}KB`;
		return mb < 1024 ? `${mb.toFixed(1)}MB` : `${(mb / 1024).toFixed(2)}GB`;
	}

	private formatBytes(bytes: number): string {
		if (bytes === 0) return '0 B';
		const i = Math.floor(Math.log(bytes) / Math.log(1024));
		return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${['B', 'KB', 'MB', 'GB'][i]}`;
	}
}
