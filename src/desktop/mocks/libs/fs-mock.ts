/**
 * Mock fs module for browser environment
 */
export function existsSync(_path: string): boolean { return false; }
export function readFileSync(_path: string, _encoding?: string): string { return ''; }
export function writeFileSync(_path: string, _data: string): void {}
export function mkdirSync(_path: string, _options?: any): void {}
export function readdirSync(_path: string): string[] { return []; }
export function statSync(_path: string): any { return { isFile: () => false, isDirectory: () => false }; }
export function unlinkSync(_path: string): void {}
export function readFile(_path: string, _cb: Function): void { _cb(null, ''); }
export function writeFile(_path: string, _data: string, _cb: Function): void { _cb(null); }

export const promises = {
	readFile: async (_path: string) => '',
	writeFile: async (_path: string, _data: string) => {},
	mkdir: async (_path: string, _options?: any) => {},
	readdir: async (_path: string) => [] as string[],
	stat: async (_path: string) => ({ isFile: () => false, isDirectory: () => false }),
	unlink: async (_path: string) => {},
	access: async (_path: string) => {},
};

export default {
	existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync,
	statSync, unlinkSync, readFile, writeFile, promises,
};
