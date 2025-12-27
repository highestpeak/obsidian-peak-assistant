/**
 * Temporary type declaration for better-sqlite3
 * This will be replaced by @types/better-sqlite3 after npm install
 */
declare module 'better-sqlite3' {
	export interface Database {
		open: boolean;
		exec(sql: string): void;
		prepare(sql: string): Statement;
		pragma(sql: string, options?: any): any;
		close(): void;
	}

	export interface Statement {
		run(...params: any[]): RunResult;
		get(...params: any[]): any;
		all(...params: any[]): any[];
	}

	export interface RunResult {
		changes: number;
		lastInsertRowid: number;
	}

	export default class DatabaseClass {
		constructor(path: string, options?: any);
		open: boolean;
		exec(sql: string): void;
		prepare(sql: string): Statement;
		pragma(sql: string, options?: any): any;
		close(): void;
	}
}

