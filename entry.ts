/**
 * Two-stage plugin entry (startup-OOM defense).
 *
 * Obsidian's own startup on large vaults transiently allocates a multi-GB
 * Blink/Oilpan heap spike in the renderer (measured ~2-2.6GB on this vault,
 * independent of any plugin — vanilla theme + zero plugins reproduce it).
 * Evaluating Peak's full 22MB bundle at plugin-load time adds ~500MB of
 * module-eval memory INSIDE that spike window, pushing the renderer past
 * its ~3.4GB cppgc ceiling → SIGABRT → the white-screen crash loop.
 *
 * This shell is the esbuild entry point. It keeps plugin load near-free
 * (only the source is parsed; no module bodies evaluate) and defers the
 * real boot — a dynamic import of `./main`, which esbuild wraps lazily in
 * the same main.js — until the storm has passed:
 *   • adaptive: boot as soon as renderer RSS drops below BOOT_RSS_SAFE_MB
 *     after layout-ready (storm peaked and GC reclaimed), or
 *   • hard cap: BOOT_MAX_DELAY_MS after layout-ready, storm or not, so
 *     Peak never silently fails to start.
 *
 * The real plugin (`main.ts` MyPlugin) is attached as a Component child so
 * Obsidian's normal load/unload lifecycle applies unchanged.
 */

import { Plugin } from 'obsidian';

/** Boot immediately once renderer RSS is below this (storm cleared). */
const BOOT_RSS_SAFE_MB = 1700;
/** Poll cadence for the RSS gate. */
const BOOT_POLL_MS = 3000;
/** Never wait longer than this after layout-ready. */
const BOOT_MAX_DELAY_MS = 120_000;
/** Give Obsidian's own post-layout work a head start before first check. */
const BOOT_MIN_DELAY_MS = 8000;

function rendererRssMb(): number {
	try {
		return Math.round(process.memoryUsage().rss / 1048576);
	} catch {
		return 0;
	}
}

export default class PeakShellPlugin extends Plugin {
	private impl: Plugin | null = null;
	private booted = false;
	private pollTimer: number | null = null;

	async onload() {
		this.app.workspace.onLayoutReady(() => {
			const start = Date.now();
			const tryBoot = () => {
				if (this.booted) return;
				const elapsed = Date.now() - start;
				const rss = rendererRssMb();
				const stormCleared = rss > 0 && rss < BOOT_RSS_SAFE_MB;
				const capReached = elapsed >= BOOT_MAX_DELAY_MS;
				if (elapsed >= BOOT_MIN_DELAY_MS && (stormCleared || capReached)) {
					console.log(
						`[Peak Shell] booting core (rss=${rss}MB, waited=${Math.round(elapsed / 1000)}s, ` +
							`${stormCleared ? 'storm cleared' : 'max-delay cap'})`,
					);
					void this.boot();
					return;
				}
				this.pollTimer = window.setTimeout(tryBoot, BOOT_POLL_MS);
			};
			this.pollTimer = window.setTimeout(tryBoot, BOOT_MIN_DELAY_MS);
		});
	}

	private async boot(): Promise<void> {
		if (this.booted) return;
		this.booted = true;
		if (this.pollTimer !== null) {
			window.clearTimeout(this.pollTimer);
			this.pollTimer = null;
		}
		try {
			// Lazy edge: esbuild defers evaluation of the entire main.ts module
			// graph (~500MB) to this moment.
			const { default: MyPlugin } = await import('./main');
			const impl = new MyPlugin(this.app, this.manifest);
			this.impl = impl;
			// Component child: load() runs impl.onload(); shell unload cascades.
			this.addChild(impl);
		} catch (e) {
			this.booted = false;
			console.error('[Peak Shell] core boot failed:', e);
		}
	}

	onunload() {
		if (this.pollTimer !== null) {
			window.clearTimeout(this.pollTimer);
			this.pollTimer = null;
		}
		// impl unloads via Component child cascade.
	}
}
