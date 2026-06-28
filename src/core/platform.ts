/**
 * T11R: Platform detection without importing `obsidian.Platform`.
 *
 * Re-exports the runtime checks from {@link PlatformPort}. Existing imports
 * `from '@/core/platform'` keep working; the underlying detection now uses
 * `process.versions.electron` (desktop) vs. absence (mobile/Capacitor),
 * so service/core no longer pull `Platform` from `obsidian` at audit time.
 */
export { isMobile, isDesktop } from './ports/PlatformPort';
