/**
 * NativeModuleManager — automatic lifecycle management for native Node.js modules.
 *
 * Handles the "better-sqlite3 ABI mismatch" problem that occurs when Obsidian
 * upgrades Electron (and therefore its Node.js ABI version) while the installed
 * native .node binary was compiled for a different ABI.
 *
 * Flow:
 *   1. On plugin load, detect the current Electron ABI via process.versions.modules
 *   2. Compare with the metadata of the previously-installed binary
 *   3. If incompatible (or missing), download the correct prebuilt from GitHub Releases
 *      and the JS wrapper from the npm registry, then install into {pluginDir}/native/
 *   4. Expose the managed path so BetterSqliteStore can require() from it
 */
import { requestUrl, Notice } from 'obsidian';
import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface NativeModuleMetadata {
	betterSqlite3?: {
		/** npm package version, e.g. "11.10.0" */
		version: string;
		/** Node.js ABI version the binary was built for, e.g. "128" */
		abi: string;
		/** process.platform */
		platform: string;
		/** process.arch */
		arch: string;
		/** ISO-8601 timestamp of when the binary was installed */
		installedAt: string;
	};
}

interface RuntimeInfo {
	abi: string;
	platform: string;
	arch: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const NATIVE_DIR = 'native';
const METADATA_FILE = 'native-modules.json';
const BS3_DIR = 'better-sqlite3';

/**
 * Pinned version — must match the version in package.json.
 * NativeModuleManager uses this when no node_modules copy is available to
 * read the version from.
 */
const BS3_PINNED_VERSION = '11.10.0';

/**
 * GitHub prebuilt tarball URL template.
 * runtime = 'electron' or 'node' — better-sqlite3 publishes both.
 */
const BS3_PREBUILT_URL = (version: string, runtime: string, abi: string, platform: string, arch: string) =>
	`https://github.com/WiseLibs/better-sqlite3/releases/download/v${version}/better-sqlite3-v${version}-${runtime}-v${abi}-${platform}-${arch}.tar.gz`;

/** npm registry tarball URL */
const BS3_NPM_URL = (version: string) =>
	`https://registry.npmjs.org/better-sqlite3/-/better-sqlite3-${version}.tgz`;

// ---------------------------------------------------------------------------
// NativeModuleManager
// ---------------------------------------------------------------------------

export class NativeModuleManager {
	private static instance: NativeModuleManager | null = null;

	/** Absolute path to the plugin directory */
	private pluginDir = '';

	static getInstance(): NativeModuleManager {
		if (!NativeModuleManager.instance) {
			NativeModuleManager.instance = new NativeModuleManager();
		}
		return NativeModuleManager.instance;
	}

	static clearInstance(): void {
		NativeModuleManager.instance = null;
	}

	setPluginDir(pluginDir: string): void {
		this.pluginDir = pluginDir;
	}

	// -- Paths --

	/** Root directory for managed native modules */
	private get nativeDir(): string {
		return path.join(this.pluginDir, NATIVE_DIR);
	}

	/** Metadata JSON path */
	private get metadataPath(): string {
		return path.join(this.nativeDir, METADATA_FILE);
	}

	/** Managed better-sqlite3 module directory */
	private get bs3Dir(): string {
		return path.join(this.nativeDir, BS3_DIR);
	}

	// -- Public API --

	/**
	 * Returns the absolute path to the managed better-sqlite3 directory,
	 * or null if no managed copy exists.
	 * This path can be passed to `require()` or used in `getPossiblePaths()`.
	 */
	getManagedModulePath(): string | null {
		const pkgPath = path.join(this.bs3Dir, 'package.json');
		if (fs.existsSync(pkgPath)) {
			return this.bs3Dir;
		}
		return null;
	}

	/**
	 * Detect the current Electron/Node runtime ABI, platform, and architecture.
	 */
	detectRuntime(): RuntimeInfo {
		return {
			abi: process.versions.modules,
			platform: process.platform,
			arch: process.arch,
		};
	}

	/**
	 * Check whether the managed binary is compatible with the current runtime.
	 */
	isCompatible(): boolean {
		const metadata = this.readMetadata();
		if (!metadata?.betterSqlite3) return false;

		const runtime = this.detectRuntime();
		return (
			metadata.betterSqlite3.abi === runtime.abi &&
			metadata.betterSqlite3.platform === runtime.platform &&
			metadata.betterSqlite3.arch === runtime.arch
		);
	}

	/**
	 * Main entry point.  Ensures a compatible better-sqlite3 binary is available.
	 *
	 * If the managed copy is already up-to-date this is a fast no-op (one JSON read).
	 * Otherwise it downloads the correct prebuilt binary (and JS wrapper if needed)
	 * from GitHub / npm and installs it under {pluginDir}/native/.
	 *
	 * Also checks the node_modules copy — if it already works, skips the download.
	 */
	async ensureCompatible(): Promise<void> {
		if (!this.pluginDir) {
			console.warn('[NativeModuleManager] pluginDir not set, skipping');
			return;
		}

		// Fast path: managed copy exists and matches current ABI
		if (this.isCompatible()) {
			console.debug('[NativeModuleManager] Managed binary is compatible, skipping download');
			return;
		}

		// Check if the node_modules copy already works (e.g. developer just ran npm rebuild)
		if (this.isNodeModulesBinaryWorking()) {
			console.debug('[NativeModuleManager] node_modules binary is working, skipping download');
			return;
		}

		// Need to download
		const runtime = this.detectRuntime();
		const version = this.resolveVersion();

		console.log(
			`[NativeModuleManager] Native module incompatible or missing.`,
			`Runtime: ABI=${runtime.abi} ${runtime.platform}-${runtime.arch}.`,
			`Will download better-sqlite3@${version} prebuilt.`,
		);

		const notice = new Notice(
			`Peak Assistant: downloading SQLite component...`,
			0, // persistent until dismissed
		);

		try {
			await this.setupBetterSqlite3(version, runtime);

			notice.setMessage('Peak Assistant: SQLite component ready');
			setTimeout(() => notice.hide(), 3000);
		} catch (error) {
			notice.hide();
			const msg = error instanceof Error ? error.message : String(error);
			console.error('[NativeModuleManager] Failed to set up better-sqlite3:', msg);

			new Notice(
				`Peak Assistant: SQLite component download failed.\n` +
				`Please check your network and restart Obsidian.\n` +
				`Or manually run: cd "${this.pluginDir}" && npm install better-sqlite3`,
				15000,
			);
			// Don't throw — let the existing fallback logic in BetterSqliteStore handle it
		}
	}

	// -- Download & Install --

	/**
	 * Full setup: download JS wrapper from npm + prebuilt binary from GitHub.
	 */
	private async setupBetterSqlite3(version: string, runtime: RuntimeInfo): Promise<void> {
		// Ensure native directory exists
		this.ensureDir(this.nativeDir);
		this.ensureDir(this.bs3Dir);

		// Step 1: Download and extract JS files from npm (if not already present)
		const jsReady = fs.existsSync(path.join(this.bs3Dir, 'lib', 'index.js'));
		const existingMeta = this.readMetadata();
		const versionChanged = existingMeta?.betterSqlite3?.version !== version;

		if (!jsReady || versionChanged) {
			console.log(`[NativeModuleManager] Downloading better-sqlite3@${version} from npm...`);
			await this.downloadAndExtractNpmPackage(version);
		}

		// Step 2: Download prebuilt binary from GitHub Releases
		console.log(
			`[NativeModuleManager] Downloading prebuilt binary for ABI=${runtime.abi} ${runtime.platform}-${runtime.arch}...`,
		);
		await this.downloadAndExtractPrebuilt(version, runtime);

		// Step 3: Verify the binary actually works before writing metadata
		const binaryPath = path.join(this.bs3Dir, 'build', 'Release', 'better_sqlite3.node');
		if (!this.verifyBinaryWorks(binaryPath)) {
			// Binary doesn't work — remove it so we don't cache a bad state
			try { fs.unlinkSync(binaryPath); } catch { /* ignore */ }
			throw new Error(
				`Downloaded binary failed verification (ABI mismatch). ` +
				`Runtime ABI=${runtime.abi}, but the prebuilt may have been compiled for a different version. ` +
				`Try: cd "${this.pluginDir}" && npx @electron/rebuild -f -w better-sqlite3`,
			);
		}

		// Step 4: Write metadata only after successful verification
		this.writeMetadata({
			betterSqlite3: {
				version,
				abi: runtime.abi,
				platform: runtime.platform,
				arch: runtime.arch,
				installedAt: new Date().toISOString(),
			},
		});

		console.log('[NativeModuleManager] better-sqlite3 setup complete');
	}

	/**
	 * Download the npm package tarball and extract JS files to bs3Dir.
	 * npm tarballs have structure: package/<files>
	 */
	private async downloadAndExtractNpmPackage(version: string): Promise<void> {
		const url = BS3_NPM_URL(version);
		const data = await this.downloadBuffer(url);
		const decompressed = zlib.gunzipSync(Buffer.from(data));
		const entries = parseTar(decompressed);

		// Clean existing JS files (but keep build/ which holds the binary)
		const libDir = path.join(this.bs3Dir, 'lib');
		if (fs.existsSync(libDir)) {
			fs.rmSync(libDir, { recursive: true, force: true });
		}

		for (const entry of entries) {
			// npm tarball paths start with "package/"
			if (!entry.name.startsWith('package/')) continue;
			const relativePath = entry.name.slice('package/'.length);

			// Only extract JS source, package.json, and LICENSE
			if (
				!relativePath.startsWith('lib/') &&
				relativePath !== 'package.json' &&
				relativePath !== 'LICENSE'
			) {
				continue;
			}

			// Skip directories
			if (entry.type === 'directory') {
				this.ensureDir(path.join(this.bs3Dir, relativePath));
				continue;
			}

			const targetPath = path.join(this.bs3Dir, relativePath);
			this.ensureDir(path.dirname(targetPath));
			fs.writeFileSync(targetPath, entry.data);
		}
	}

	/**
	 * Download the prebuilt .node binary from GitHub Releases.
	 * Tries electron runtime first (correct for Obsidian), then node runtime.
	 * If both fail, falls back to compiling from source via node-gyp.
	 */
	private async downloadAndExtractPrebuilt(version: string, runtime: RuntimeInfo): Promise<void> {
		const targetDir = path.join(this.bs3Dir, 'build', 'Release');
		this.ensureDir(targetDir);
		const targetPath = path.join(targetDir, 'better_sqlite3.node');

		// Try download: electron runtime first, then node
		for (const rt of ['electron', 'node']) {
			const url = BS3_PREBUILT_URL(version, rt, runtime.abi, runtime.platform, runtime.arch);
			try {
				console.log(`[NativeModuleManager] Trying ${rt} prebuilt: ${url}`);
				const data = await this.downloadBuffer(url);
				const decompressed = zlib.gunzipSync(Buffer.from(data));
				const entries = parseTar(decompressed);
				const nodeEntry = entries.find(
					(e) => e.name.endsWith('better_sqlite3.node') && e.type === 'file',
				);
				if (nodeEntry) {
					fs.writeFileSync(targetPath, nodeEntry.data);
					console.log(`[NativeModuleManager] Installed ${rt} prebuilt for ABI=${runtime.abi}`);
					return;
				}
			} catch (e) {
				console.warn(`[NativeModuleManager] ${rt} prebuilt failed:`, e instanceof Error ? e.message : e);
			}
		}

		// Download failed — try compiling from source if node_modules/better-sqlite3 exists
		console.log('[NativeModuleManager] No prebuilt available, attempting source compilation...');
		if (await this.tryCompileFromSource(runtime)) {
			return;
		}

		throw new Error(
			`No prebuilt binary for better-sqlite3@${version} ` +
			`(Electron ${process.versions.electron}, ABI=${runtime.abi}, ${runtime.platform}-${runtime.arch}). ` +
			`Compilation also failed. ` +
			`Fix: cd "${this.pluginDir}" && npm install @electron/rebuild && npx @electron/rebuild -f -w better-sqlite3`,
		);
	}

	/**
	 * Compile better-sqlite3 from source using node-gyp targeting the current Electron.
	 * Requires: node_modules/better-sqlite3 with binding.gyp + build tools (Xcode CLT / build-essential).
	 */
	private async tryCompileFromSource(runtime: RuntimeInfo): Promise<boolean> {
		const electronVersion = process.versions.electron;
		if (!electronVersion) {
			console.warn('[NativeModuleManager] Not running in Electron, cannot compile');
			return false;
		}

		const bs3NodeModules = path.join(this.pluginDir, 'node_modules', 'better-sqlite3');
		if (!fs.existsSync(path.join(bs3NodeModules, 'binding.gyp'))) {
			console.warn('[NativeModuleManager] node_modules/better-sqlite3 not found or has no binding.gyp');
			return false;
		}

		try {
			const { execSync } = require('child_process');

			// Find node-gyp
			const nodeGypPaths = [
				path.join(this.pluginDir, 'node_modules', '.bin', 'node-gyp'),
				'node-gyp', // fallback to PATH
			];
			let nodeGypBin = 'node-gyp';
			for (const p of nodeGypPaths) {
				try {
					execSync(`"${p}" --version`, { stdio: 'pipe', timeout: 5000 });
					nodeGypBin = p;
					break;
				} catch { /* try next */ }
			}

			console.log(`[NativeModuleManager] Compiling better-sqlite3 for Electron ${electronVersion} (ABI=${runtime.abi})...`);
			execSync(
				`"${nodeGypBin}" rebuild --release ` +
				`--target=${electronVersion} ` +
				`--arch=${runtime.arch} ` +
				`--dist-url=https://electronjs.org/headers ` +
				`--runtime=electron`,
				{
					cwd: bs3NodeModules,
					stdio: 'pipe',
					timeout: 120000, // 2 min
					env: { ...process.env, HOME: process.env.HOME || '' },
				},
			);

			// Copy compiled binary to managed location
			const compiledPath = path.join(bs3NodeModules, 'build', 'Release', 'better_sqlite3.node');
			if (fs.existsSync(compiledPath)) {
				const targetDir = path.join(this.bs3Dir, 'build', 'Release');
				this.ensureDir(targetDir);
				fs.copyFileSync(compiledPath, path.join(targetDir, 'better_sqlite3.node'));
				console.log('[NativeModuleManager] Source compilation succeeded');
				return true;
			}
		} catch (e) {
			console.warn('[NativeModuleManager] Source compilation failed:', e instanceof Error ? e.message : e);
		}
		return false;
	}

	// -- Helpers --

	/**
	 * Download a URL and return the raw ArrayBuffer.
	 * Uses Obsidian's requestUrl which respects system proxy settings.
	 */
	private async downloadBuffer(url: string): Promise<ArrayBuffer> {
		const response = await requestUrl({
			url,
			method: 'GET',
			throw: true, // throw on non-2xx
		});
		return response.arrayBuffer;
	}

	/**
	 * Verify a .node binary can actually be loaded by the current runtime.
	 * Tries to require() the managed module and open a :memory: DB.
	 */
	private verifyBinaryWorks(binaryPath: string): boolean {
		try {
			// Clear require cache for the managed module so we test the fresh binary
			const managedMainPath = path.join(this.bs3Dir, 'lib', 'index.js');
			for (const key in require.cache) {
				if (key.startsWith(this.bs3Dir)) {
					delete require.cache[key];
				}
			}
			const bs3 = require(managedMainPath);
			const Database = bs3.default || bs3;
			if (typeof Database !== 'function') return false;
			const testDb = new Database(':memory:');
			testDb.close();
			console.log('[NativeModuleManager] Binary verification passed');
			return true;
		} catch (e) {
			console.warn('[NativeModuleManager] Binary verification failed:', e instanceof Error ? e.message : e);
			return false;
		}
	}

	/**
	 * Try to load better-sqlite3 from node_modules and open a :memory: DB.
	 * Returns true if it works (no ABI mismatch).
	 */
	private isNodeModulesBinaryWorking(): boolean {
		try {
			const bs3 = require('better-sqlite3');
			const Database = bs3.default || bs3;
			if (typeof Database !== 'function') return false;
			const testDb = new Database(':memory:');
			testDb.close();
			return true;
		} catch {
			return false;
		}
	}

	/**
	 * Determine which version of better-sqlite3 to download.
	 * Prefers the version from node_modules/better-sqlite3/package.json,
	 * falls back to the pinned constant.
	 */
	private resolveVersion(): string {
		try {
			const nmPkg = path.join(this.pluginDir, 'node_modules', 'better-sqlite3', 'package.json');
			if (fs.existsSync(nmPkg)) {
				const pkg = JSON.parse(fs.readFileSync(nmPkg, 'utf8'));
				if (pkg.version) return pkg.version;
			}
		} catch {
			// ignore
		}
		return BS3_PINNED_VERSION;
	}

	private readMetadata(): NativeModuleMetadata | null {
		try {
			if (fs.existsSync(this.metadataPath)) {
				return JSON.parse(fs.readFileSync(this.metadataPath, 'utf8'));
			}
		} catch {
			// corrupt file — will be overwritten
		}
		return null;
	}

	private writeMetadata(metadata: NativeModuleMetadata): void {
		this.ensureDir(this.nativeDir);
		fs.writeFileSync(this.metadataPath, JSON.stringify(metadata, null, 2), 'utf8');
	}

	private ensureDir(dir: string): void {
		if (!fs.existsSync(dir)) {
			fs.mkdirSync(dir, { recursive: true });
		}
	}
}

// ---------------------------------------------------------------------------
// Minimal tar parser (no external dependencies)
// ---------------------------------------------------------------------------

interface TarEntry {
	name: string;
	type: 'file' | 'directory';
	data: Buffer;
}

/**
 * Parse a tar archive (uncompressed) and return all entries.
 *
 * tar format: consecutive 512-byte header blocks followed by file data
 * (padded to 512-byte boundary). Two consecutive zero blocks = end of archive.
 *
 * Header layout (POSIX/USTAR):
 *   offset   0, length 100: filename (null-terminated)
 *   offset 100, length   8: file mode (octal ASCII)
 *   offset 124, length  12: file size (octal ASCII)
 *   offset 156, length   1: type flag ('0'/'\0' = file, '5' = directory)
 *   offset 345, length 155: filename prefix (USTAR)
 *   offset 257, length   6: USTAR magic ("ustar\0" or "ustar ")
 */
function parseTar(buffer: Buffer): TarEntry[] {
	const entries: TarEntry[] = [];
	let offset = 0;

	while (offset + 512 <= buffer.length) {
		const header = buffer.subarray(offset, offset + 512);

		// Two consecutive zero blocks = end of archive
		if (header.every((b) => b === 0)) break;

		// Parse filename
		let name = readString(header, 0, 100);

		// USTAR prefix
		const magic = readString(header, 257, 6);
		if (magic.startsWith('ustar')) {
			const prefix = readString(header, 345, 155);
			if (prefix) {
				name = prefix + '/' + name;
			}
		}

		// Parse size (octal ASCII, null/space terminated)
		const sizeStr = readString(header, 124, 12).trim();
		const size = sizeStr ? parseInt(sizeStr, 8) : 0;

		// Parse type
		const typeFlag = header[156];
		const type: 'file' | 'directory' =
			typeFlag === 53 /* '5' */ ? 'directory' : 'file';

		offset += 512; // skip header

		// Read file data
		const data = type === 'file' && size > 0 ? Buffer.from(buffer.subarray(offset, offset + size)) : Buffer.alloc(0);

		// Advance past data blocks (padded to 512)
		offset += Math.ceil(size / 512) * 512;

		// Skip entries with empty names (padding blocks)
		if (!name) continue;

		entries.push({ name, type, data });
	}

	return entries;
}

/** Read a null-terminated ASCII string from a buffer region. */
function readString(buffer: Buffer, offset: number, length: number): string {
	const slice = buffer.subarray(offset, offset + length);
	const nullIdx = slice.indexOf(0);
	const end = nullIdx === -1 ? length : nullIdx;
	return slice.subarray(0, end).toString('ascii');
}
