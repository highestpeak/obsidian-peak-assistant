/**
 * Mock path module for browser environment
 */
export function join(...parts: string[]): string { return parts.filter(Boolean).join('/').replace(/\/+/g, '/'); }
export function resolve(...parts: string[]): string { return join(...parts); }
export function dirname(p: string): string { return p.split('/').slice(0, -1).join('/') || '/'; }
export function basename(p: string, ext?: string): string {
	const base = p.split('/').pop() || '';
	return ext && base.endsWith(ext) ? base.slice(0, -ext.length) : base;
}
export function extname(p: string): string { const m = p.match(/\.[^./]+$/); return m ? m[0] : ''; }
export function normalize(p: string): string { return p.replace(/\/+/g, '/'); }
export function isAbsolute(p: string): boolean { return p.startsWith('/'); }
export function relative(from: string, to: string): string { return to; }
export const sep = '/';
export const delimiter = ':';
export const posix = { join, resolve, dirname, basename, extname, normalize, isAbsolute, relative, sep, delimiter };

export default { join, resolve, dirname, basename, extname, normalize, isAbsolute, relative, sep, delimiter, posix };
