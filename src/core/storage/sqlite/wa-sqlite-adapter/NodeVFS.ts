/**
 * Node.js VFS implementation for wa-sqlite.
 * Provides file system access using Node.js fs module with partial read/write.
 * 
 * This implementation uses file descriptors for efficient partial I/O,
 * avoiding loading entire database files into memory.
 */
import * as fs from 'fs';
import * as path from 'path';
// @ts-ignore - FacadeVFS doesn't have type definitions
import { FacadeVFS } from '@journeyapps/wa-sqlite/src/FacadeVFS.js';
import * as VFS from '@journeyapps/wa-sqlite/src/VFS.js';

interface FileHandle {
	pathname: string;
	fd: number;
	flags: number;
}

export class NodeVFS extends FacadeVFS {
	private mapIdToFile = new Map<number, FileHandle>();

	constructor(name: string = 'node', module?: any) {
		super(name, module);
	}

	close(): void {
		for (const fileId of this.mapIdToFile.keys()) {
			this.jClose(fileId);
		}
	}

	jOpen(filename: string | null, fileId: number, flags: number, pOutFlags: DataView): number {
		if (!filename) {
			return VFS.SQLITE_CANTOPEN;
		}

		// Normalize path
		const normalizedPath = path.normalize(filename);

		// Ensure directory exists
		const dir = path.dirname(normalizedPath);
		if (!fs.existsSync(dir)) {
			try {
				fs.mkdirSync(dir, { recursive: true });
			} catch (error) {
				console.error('[NodeVFS] Failed to create directory:', error);
				return VFS.SQLITE_CANTOPEN;
			}
		}

		// Determine file open flags
		let nodeFlags: number;
		if (flags & VFS.SQLITE_OPEN_READWRITE) {
			if (flags & VFS.SQLITE_OPEN_CREATE) {
				nodeFlags = fs.constants.O_RDWR | fs.constants.O_CREAT;
			} else {
				nodeFlags = fs.constants.O_RDWR;
			}
		} else if (flags & VFS.SQLITE_OPEN_READONLY) {
			nodeFlags = fs.constants.O_RDONLY;
		} else {
			return VFS.SQLITE_CANTOPEN;
		}

		// Open file and get file descriptor
		let fd: number;
		try {
			fd = fs.openSync(normalizedPath, nodeFlags, 0o666);
		} catch (error) {
			console.error('[NodeVFS] Failed to open file:', error);
			return VFS.SQLITE_CANTOPEN;
		}

		// Store file handle
		this.mapIdToFile.set(fileId, {
			pathname: normalizedPath,
			fd,
			flags,
		});

		// Set output flags
		pOutFlags.setInt32(0, flags, true);
		return VFS.SQLITE_OK;
	}

	jClose(fileId: number): number {
		const file = this.mapIdToFile.get(fileId);
		if (!file) {
			return VFS.SQLITE_OK;
		}

		try {
			fs.closeSync(file.fd);
		} catch (error) {
			console.error('[NodeVFS] Failed to close file:', error);
			return VFS.SQLITE_IOERR_CLOSE;
		}

		this.mapIdToFile.delete(fileId);
		return VFS.SQLITE_OK;
	}

	jRead(fileId: number, pData: Uint8Array, iOffset: number): number {
		const file = this.mapIdToFile.get(fileId);
		if (!file) {
			return VFS.SQLITE_IOERR_READ;
		}

		try {
			// Read partial data from file at specific offset
			const buffer = Buffer.from(pData.buffer, pData.byteOffset, pData.byteLength);
			const bytesRead = fs.readSync(file.fd, buffer, 0, pData.length, iOffset);

			if (bytesRead < pData.length) {
				// Partial read - fill remaining with zeros
				if (bytesRead > 0) {
					pData.set(buffer.subarray(0, bytesRead));
				}
				return VFS.SQLITE_IOERR_SHORT_READ;
			}

			pData.set(buffer);
			return VFS.SQLITE_OK;
		} catch (error) {
			console.error('[NodeVFS] Read error:', error);
			return VFS.SQLITE_IOERR_READ;
		}
	}

	jWrite(fileId: number, pData: Uint8Array, iOffset: number): number {
		const file = this.mapIdToFile.get(fileId);
		if (!file) {
			return VFS.SQLITE_IOERR_WRITE;
		}

		try {
			// Write partial data to file at specific offset
			const buffer = Buffer.from(pData.buffer, pData.byteOffset, pData.byteLength);
			fs.writeSync(file.fd, buffer, 0, pData.length, iOffset);
			return VFS.SQLITE_OK;
		} catch (error) {
			console.error('[NodeVFS] Write error:', error);
			return VFS.SQLITE_IOERR_WRITE;
		}
	}

	jTruncate(fileId: number, iSize: number): number {
		const file = this.mapIdToFile.get(fileId);
		if (!file) {
			return VFS.SQLITE_IOERR_TRUNCATE;
		}

		try {
			fs.ftruncateSync(file.fd, iSize);
			return VFS.SQLITE_OK;
		} catch (error) {
			console.error('[NodeVFS] Truncate error:', error);
			return VFS.SQLITE_IOERR_TRUNCATE;
		}
	}

	jSync(fileId: number, flags: number): number {
		const file = this.mapIdToFile.get(fileId);
		if (!file) {
			return VFS.SQLITE_OK;
		}

		try {
			// Sync file to disk
			// SQLITE_SYNC_FULL (0x00003) means sync both data and metadata
			// SQLITE_SYNC_NORMAL (0x00002) means sync data only
			if ((flags & VFS.SQLITE_SYNC_FULL) === VFS.SQLITE_SYNC_FULL) {
				fs.fsyncSync(file.fd);
			} else {
				// Use fdatasync for data-only sync (more efficient)
				// Fallback to fsync if fdatasync is not available
				try {
					fs.fdatasyncSync(file.fd);
				} catch {
					fs.fsyncSync(file.fd);
				}
			}
			return VFS.SQLITE_OK;
		} catch (error) {
			console.error('[NodeVFS] Sync error:', error);
			return VFS.SQLITE_IOERR_FSYNC;
		}
	}

	jFileSize(fileId: number, pSize64: DataView): number {
		const file = this.mapIdToFile.get(fileId);
		if (!file) {
			return VFS.SQLITE_IOERR_FSTAT;
		}

		try {
			const stats = fs.fstatSync(file.fd);
			const size = BigInt(stats.size);
			pSize64.setBigUint64(0, size, true);
			return VFS.SQLITE_OK;
		} catch (error) {
			console.error('[NodeVFS] FileSize error:', error);
			return VFS.SQLITE_IOERR_FSTAT;
		}
	}

	jDelete(name: string, syncDir: number): number {
		try {
			if (fs.existsSync(name)) {
				fs.unlinkSync(name);
			}
			return VFS.SQLITE_OK;
		} catch (error) {
			console.error('[NodeVFS] Delete error:', error);
			return VFS.SQLITE_IOERR_DELETE;
		}
	}

	jAccess(name: string, flags: number, pResOut: DataView): number {
		try {
			if (flags === VFS.SQLITE_ACCESS_EXISTS) {
				pResOut.setInt32(0, fs.existsSync(name) ? 1 : 0, true);
			} else if (flags === VFS.SQLITE_ACCESS_READWRITE) {
				try {
					fs.accessSync(name, fs.constants.R_OK | fs.constants.W_OK);
					pResOut.setInt32(0, 1, true);
				} catch {
					pResOut.setInt32(0, 0, true);
				}
			} else if (flags === VFS.SQLITE_ACCESS_READ) {
				try {
					fs.accessSync(name, fs.constants.R_OK);
					pResOut.setInt32(0, 1, true);
				} catch {
					pResOut.setInt32(0, 0, true);
				}
			}
			return VFS.SQLITE_OK;
		} catch (error) {
			return VFS.SQLITE_IOERR_ACCESS;
		}
	}
}
