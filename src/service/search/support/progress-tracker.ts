import { App, Notice } from 'obsidian';

/**
 * Progress tracker for indexing operations.
 * Shows periodic updates and final statistics.
 */
export class IndexProgressTracker {
	private notice: Notice | null = null;
	private readonly totalFiles: number | null;
	private startTime: number | null = null;

	constructor(
		private readonly app: App,
		totalFiles?: number,
	) {
		this.totalFiles = totalFiles ?? null;
	}

	/**
	 * Show initial progress message.
	 * Records the start time for automatic duration calculation.
	 */
	showStart(customMessage?: string): void {
		const message = customMessage || 'Building search index...';
		this.notice = new Notice(message, 0); // 0 = don't auto-hide
		this.startTime = Date.now();
	}

	/**
	 * Update progress with current count.
	 * Shows percentage, elapsed time, and estimated remaining time.
	 */
	updateProgress(currentCount: number): void {
		if (!this.notice) return;

		let message: string;
		if (this.totalFiles !== null && this.totalFiles > 0) {
			const percentage = Math.round((currentCount / this.totalFiles) * 100);
			
			// Calculate elapsed time
			const elapsedMs = this.startTime ? Date.now() - this.startTime : 0;
			const elapsedText = this.formatDuration(elapsedMs);
			
			// Calculate estimated remaining time
			let remainingText = '';
			if (currentCount > 0 && currentCount < this.totalFiles) {
				const avgTimePerFile = elapsedMs / currentCount;
				const remainingFiles = this.totalFiles - currentCount;
				const estimatedRemainingMs = avgTimePerFile * remainingFiles;
				remainingText = `, ~${this.formatDuration(estimatedRemainingMs)} remaining`;
			}
			
			message = `Indexing: ${currentCount}/${this.totalFiles} files (${percentage}%) - ${elapsedText} elapsed${remainingText}`;
		} else {
			const elapsedMs = this.startTime ? Date.now() - this.startTime : 0;
			const elapsedText = this.formatDuration(elapsedMs);
			message = `Indexing: ${currentCount} files processed... - ${elapsedText} elapsed`;
		}

		// Update notice by creating a new one (Obsidian doesn't support updating existing notices)
		this.notice.hide();
		this.notice = new Notice(message, 0);
	}

	/**
	 * Show completion message with statistics.
	 * Accepts a record of key-value pairs for flexible statistics display.
	 * 
	 * Automatically calculates duration if startTime was recorded in showStart()
	 * and duration is not provided in stats.
	 * 
	 * Supported field formatters:
	 * - duration: formats as time (ms -> human readable)
	 * - storageSize: formats as bytes (bytes -> human readable)
	 * - memoryDelta: formats as memory (MB -> human readable with sign)
	 * - Other fields: displayed as-is
	 */
	showComplete(stats: Record<string, any>): void {
		if (this.notice) {
			this.notice.hide();
		}

		// Automatically calculate duration if not provided and startTime is available
		const finalStats = { ...stats };
		if (finalStats.duration === undefined && this.startTime !== null) {
			finalStats.duration = Date.now() - this.startTime;
		}

		const formattedStats: Array<{ label: string; value: string }> = [];

		// Field formatters for common statistics
		const formatters: Record<string, (value: any) => string> = {
			duration: (ms: number) => this.formatDuration(ms),
			storageSize: (bytes: number) => this.formatBytes(bytes),
			memoryDelta: (mb: number) => {
				const memoryText = this.formatMemory(Math.abs(mb));
				const sign = mb >= 0 ? '+' : '';
				return `${sign}${memoryText}`;
			},
		};

		// Field labels for display
		const labels: Record<string, string> = {
			totalIndexed: 'Documents',
			duration: 'Duration',
			storageSize: 'Storage',
			memoryDelta: 'Memory',
		};

		// Process each stat field
		for (const [key, value] of Object.entries(finalStats)) {
			if (value === undefined || value === null) {
				continue;
			}

			const formatter = formatters[key];
			const formattedValue = formatter ? formatter(value) : String(value);
			const label = labels[key] || this.formatFieldName(key);

			formattedStats.push({ label, value: formattedValue });
		}

		// Build message
		const statLines = formattedStats.map(stat => `${stat.label}: ${stat.value}`);
		const message = `Indexing complete!\n${statLines.join('\n')}`;

		this.notice = new Notice(message, 8000);
	}

	/**
	 * Format field name from camelCase to Title Case.
	 */
	private formatFieldName(fieldName: string): string {
		return fieldName
			.replace(/([A-Z])/g, ' $1')
			.replace(/^./, str => str.toUpperCase())
			.trim();
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

