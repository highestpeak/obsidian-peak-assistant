import { App, Notice } from 'obsidian';

/**
 * Progress tracker for indexing operations.
 * Shows periodic updates and final statistics.
 */
export class IndexProgressTracker {
	private notice: Notice | null = null;
	private readonly totalFiles: number | null;

	constructor(
		private readonly app: App,
		totalFiles?: number,
	) {
		this.totalFiles = totalFiles ?? null;
	}

	/**
	 * Show initial progress message.
	 */
	showStart(customMessage?: string): void {
		const message = customMessage || 'Building search index...';
		this.notice = new Notice(message, 0); // 0 = don't auto-hide
	}

	/**
	 * Update progress with current count.
	 */
	updateProgress(currentCount: number): void {
		if (!this.notice) return;

		let message: string;
		if (this.totalFiles !== null) {
			const percentage = Math.round((currentCount / this.totalFiles) * 100);
			message = `Indexing: ${currentCount}/${this.totalFiles} files (${percentage}%)`;
		} else {
			message = `Indexing: ${currentCount} files processed...`;
		}

		// Update notice by creating a new one (Obsidian doesn't support updating existing notices)
		this.notice.hide();
		this.notice = new Notice(message, 0);
	}

	/**
	 * Show completion message with statistics.
	 */
	showComplete(stats: {
		totalIndexed: number;
		duration: number;
		memoryDelta: number;
		storageSize: number;
	}): void {
		if (this.notice) {
			this.notice.hide();
		}

		const durationText = this.formatDuration(stats.duration);
		const memoryText = this.formatMemory(Math.abs(stats.memoryDelta));
		const storageText = this.formatBytes(stats.storageSize);
		const memorySign = stats.memoryDelta >= 0 ? '+' : '';

		const message = `Indexing complete!\n` +
			`Documents: ${stats.totalIndexed}\n` +
			`Duration: ${durationText}\n` +
			`Memory: ${memorySign}${memoryText}\n` +
			`Storage: ${storageText}`;

		this.notice = new Notice(message, 8000);
	}

	/**
	 * Show error message.
	 */
	showError(errorMessage: string): void {
		if (this.notice) {
			this.notice.hide();
		}
		this.notice = new Notice(`Indexing failed: ${errorMessage}`, 5000);
	}

	/**
	 * Format duration in milliseconds to human-readable string.
	 */
	private formatDuration(ms: number): string {
		if (ms < 1000) {
			return `${ms}ms`;
		}
		const seconds = Math.floor(ms / 1000);
		if (seconds < 60) {
			return `${seconds}s`;
		}
		const minutes = Math.floor(seconds / 60);
		const remainingSeconds = seconds % 60;
		if (minutes < 60) {
			return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
		}
		const hours = Math.floor(minutes / 60);
		const remainingMinutes = minutes % 60;
		return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
	}

	/**
	 * Format memory size in MB to human-readable string.
	 */
	private formatMemory(mb: number): string {
		if (mb < 1) {
			return `${Math.round(mb * 1024)}KB`;
		}
		if (mb < 1024) {
			return `${mb.toFixed(1)}MB`;
		}
		return `${(mb / 1024).toFixed(2)}GB`;
	}

	/**
	 * Format bytes to human-readable string.
	 */
	private formatBytes(bytes: number): string {
		if (bytes === 0) return '0 B';
		const k = 1024;
		const sizes = ['B', 'KB', 'MB', 'GB'];
		const i = Math.floor(Math.log(bytes) / Math.log(k));
		return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
	}
}

