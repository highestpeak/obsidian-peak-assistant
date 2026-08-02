/**
 * Physical byte/text operations used by generated-output stores.
 *
 * The core storage layer deliberately knows nothing about Obsidian. The app
 * layer binds this port to the Vault adapter once per plugin runtime.
 */
export interface GeneratedOutputDataAdapter {
	exists(path: string): Promise<boolean>;
	readText(path: string): Promise<string>;
	writeText(path: string, content: string): Promise<void>;
	appendText(path: string, content: string): Promise<void>;
	readBinary(path: string): Promise<Uint8Array>;
	writeBinary(path: string, content: Uint8Array): Promise<void>;
	rename(fromPath: string, toPath: string): Promise<void>;
	remove(path: string): Promise<void>;
	ensureDirectory(path: string): Promise<void>;
}
