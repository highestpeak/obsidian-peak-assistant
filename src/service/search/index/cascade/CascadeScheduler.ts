/**
 * Pure idle-timer scheduler for CascadeWorker.
 * Kept in a separate file so it can be unit-tested without pulling in service imports.
 */
export class CascadeScheduler {
    private timer: ReturnType<typeof setTimeout> | null = null;
    private paused = false;
    private disposed = false;

    constructor(private readonly opts: { idleDelayMs: number; onIdle: () => void }) {}

    notifyActivity(): void {
        if (this.disposed || this.paused) return;
        this.clearTimer();
        this.timer = setTimeout(() => {
            this.timer = null;
            if (!this.disposed && !this.paused) this.opts.onIdle();
        }, this.opts.idleDelayMs);
    }

    pause(): void { this.paused = true; this.clearTimer(); }
    resume(): void { this.paused = false; }
    dispose(): void { this.disposed = true; this.clearTimer(); }
    private clearTimer(): void { if (this.timer !== null) { clearTimeout(this.timer); this.timer = null; } }
}
