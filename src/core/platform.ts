import { Platform } from 'obsidian';

/** True on iOS / Android Obsidian. */
export const isMobile = (): boolean => Platform.isMobile;

/** True on macOS / Windows / Linux Obsidian (Electron). */
export const isDesktop = (): boolean => !Platform.isMobile;
