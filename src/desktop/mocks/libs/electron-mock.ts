/**
 * Mock electron module for browser environment
 */
export const remote = null;
export const BrowserWindow = { getFocusedWindow: () => null };
export function getCurrentWindow() { return null; }
export default { remote, BrowserWindow, getCurrentWindow };
