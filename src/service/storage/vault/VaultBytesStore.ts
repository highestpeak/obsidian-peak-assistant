import type { App } from 'obsidian';
import type { BytesStore } from '@/service/storage/types';
import { VaultFileStore } from './VaultFileStore';

/**
 * Binary file store backed by Obsidian's vault adapter.
 * Stores raw bytes (e.g., SQLite databases) as binary files.
 * Can store files in user-configured directory or fallback to plugin directory.
 */
export class VaultBytesStore extends VaultFileStore implements BytesStore {
	constructor(
		app: App,
		params: {
			pluginId?: string;
			filename: string;
			storageFolder?: string;
		},
	) {
		super(app, params);
	}

	async load(): Promise<ArrayBuffer | null> {
		try {
			const buf = await (this.app.vault.adapter as any).readBinary(this.fullPath);
			if (!buf) return null;
			// Some adapters return ArrayBuffer, some return Uint8Array.
			if (buf instanceof ArrayBuffer) return buf;
			if (buf instanceof SharedArrayBuffer) {
				// Convert SharedArrayBuffer to ArrayBuffer by copying
				const arrayBuffer = new ArrayBuffer(buf.byteLength);
				new Uint8Array(arrayBuffer).set(new Uint8Array(buf));
				return arrayBuffer;
			}
			if (buf instanceof Uint8Array) {
				const underlyingBuffer = buf.buffer;
				if (underlyingBuffer instanceof SharedArrayBuffer) {
					// Convert SharedArrayBuffer to ArrayBuffer by copying
					const arrayBuffer = new ArrayBuffer(buf.byteLength);
					new Uint8Array(arrayBuffer).set(buf);
					return arrayBuffer;
				}
				return underlyingBuffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
			}
			return null;
		} catch {
			return null;
		}
	}

	async save(bytes: ArrayBuffer): Promise<void> {
		await this.ensureDirectory();
		const data = new Uint8Array(bytes);
		await (this.app.vault.adapter as any).writeBinary(this.fullPath, data);
	}
}


