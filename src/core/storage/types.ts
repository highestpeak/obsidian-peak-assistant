/**
 * Storage abstractions shared across services.
 *
 * Notes:
 * - Keep this minimal. Higher-level repositories should live next to the storage implementation.
 * - Hybrid design: bytes/KV primitives + optional repo adapters.
 */

export interface BytesStore {
	/**
	 * Load raw bytes. Returns null if not found.
	 */
	load(): Promise<ArrayBuffer | null>;
	/**
	 * Persist raw bytes.
	 */
	save(bytes: ArrayBuffer): Promise<void>;
}

export interface JsonStore {
	/**
	 * Load JSON string. Returns null if not found.
	 */
	loadJson(): Promise<string | null>;
	/**
	 * Persist JSON string (compact format).
	 */
	saveJson(jsonString: string): Promise<void>;
}

export interface KeyValueStore {
	get(key: string): Promise<string | null>;
	set(key: string, value: string): Promise<void>;
	delete(key: string): Promise<void>;
}


