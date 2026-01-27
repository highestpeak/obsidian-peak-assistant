# SQLite Storage Implementation

This directory contains the SQLite storage implementation using `wa-sqlite` (WebAssembly SQLite).

## Architecture Overview

### Design Goals

1. **No Native Dependencies**: Use WebAssembly-based SQLite to avoid native module compilation issues
2. **File Persistence**: Support direct disk file access (not in-memory only)
3. **Partial I/O**: Efficient partial read/write operations for large databases
4. **Cross-Platform**: Works in Electron (Desktop), Web, and Mobile environments
5. **Type Safety**: Full TypeScript support with Kysely query builder

### Components

```
sqlite/
├── wa-sqlite-adapter/     # wa-sqlite integration layer
│   ├── WaSqliteStore.ts   # Main store class with Kysely adapter
│   └── NodeVFS.ts         # Virtual File System for file I/O
├── repositories/          # Data access layer (repositories)
├── ddl.ts                # Database schema definitions
└── SqliteStoreManager.ts # Singleton manager for database connection
```

## Implementation Details

### 1. WaSqliteStore

The main store class that wraps `wa-sqlite` and provides a Kysely-compatible interface.

**Key Features:**
- Bridges async `wa-sqlite` API with sync Kysely interface
- Provides `exec()`, `prepare()`, `transaction()` methods
- Manages database lifecycle (open/close)

**⚠️ Performance Consideration:**
- Uses `syncWait()` to convert async operations to sync
- Can cause UI blocking for operations >100ms
- See "Performance Warnings" section below

### 2. NodeVFS (Virtual File System)

Implements efficient partial I/O using file descriptors.

**Key Features:**
- **Partial Read/Write**: Uses `fs.readSync()` and `fs.writeSync()` with offsets
- **No Memory Caching**: Direct file descriptor operations, no full-file buffering
- **Efficient for Large Files**: Works well even with 1GB+ databases
- **Low Memory Footprint**: Only reads/writes the specific pages needed

**Implementation:**
```typescript
jOpen:   fs.openSync()     // Get file descriptor
jRead:   fs.readSync()     // Partial read at offset
jWrite:  fs.writeSync()    // Partial write at offset
jSync:   fs.fsyncSync()    // Sync to disk
jClose:  fs.closeSync()    // Close file descriptor
```

**Benefits:**
- ✅ Fast startup (no full-file read)
- ✅ Low memory usage (no full-file buffer)
- ✅ Efficient writes (only modified pages)
- ✅ Scales to large databases

### 3. Cross-Platform Compatibility

#### Desktop (Electron/Node.js)
- ✅ **Current Implementation**: Uses Node.js `fs` module
- ✅ Full file system access
- ✅ Partial I/O support

#### Web (Browser)
- ⚠️ **Requires VFS Adaptation**: Need browser-compatible VFS
- Options:
  - **OPFS (Origin Private File System)**: Modern browsers support
  - **IndexedDB VFS**: Fallback for older browsers
  - **Memory VFS**: For temporary data (not persistent)

#### Mobile (React Native/Capacitor)
- ⚠️ **Requires Native Bridge**: File system access via native modules
- Options:
  - **React Native**: Use `react-native-fs` or similar
  - **Capacitor**: Use `@capacitor/filesystem` plugin
  - **Expo**: Use `expo-file-system`

**Migration Path for Web/Mobile:**

1. **Create Platform-Specific VFS:**
   ```typescript
   // Web: OPFSVFS.ts
   class OPFSVFS extends FacadeVFS {
     // Use FileSystemHandle API
   }
   
   // Mobile: NativeVFS.ts
   class NativeVFS extends FacadeVFS {
     // Use native file system bridge
   }
   ```

2. **Factory Pattern:**
   ```typescript
   function createVFS(platform: 'node' | 'web' | 'mobile') {
     switch (platform) {
       case 'node': return new NodeVFS();
       case 'web': return new OPFSVFS();
       case 'mobile': return new NativeVFS();
     }
   }
   ```

3. **Keep WaSqliteStore Unchanged:**
   - The store layer is platform-agnostic
   - Only VFS implementation changes per platform

## Performance Warnings

### syncWait() Function

The `syncWait()` function is used to bridge `wa-sqlite`'s async API with Kysely's sync interface.

**⚠️ Critical Limitations:**

1. **UI Blocking**: In single-threaded environments (Obsidian, browsers), synchronous waiting blocks the UI thread
2. **Performance Impact**:
   - <50ms: Generally acceptable
   - 50-200ms: Noticeable UI lag
   - >200ms: UI freezing, poor UX

**Current Mitigations:**
- Frequent event loop yields (setImmediate)
- Timeout protection (5 seconds)
- Iteration limits (10,000 max)
- Performance logging (>100ms warnings)

**Future Improvements:**
- Migrate to fully async API
- Use async/await throughout call chain
- Consider Web Workers for heavy operations

### Best Practices

1. **Keep Operations Small**: Break large operations into smaller batches
2. **Batch Operations**: Group multiple operations when possible
3. **Background Tasks**: Move heavy operations to background threads/workers
4. **Monitor Performance**: Watch for syncWait warnings in console

## Database Schema

See `ddl.ts` for complete schema definitions. Key tables:

- `doc_meta`: Document metadata
- `doc_chunk`: Document chunks for search
- `embedding`: Vector embeddings for semantic search
- `graph_nodes` / `graph_edges`: Knowledge graph
- `chat_*`: Chat conversation data

## Usage Example

```typescript
import { sqliteStoreManager } from './SqliteStoreManager';

// Initialize
await sqliteStoreManager.init({
  app: obsidianApp,
  storageFolder: '.obsidian/peak-assistant',
  filename: 'database.sqlite'
});

// Use repositories
const embeddingRepo = sqliteStoreManager.getEmbeddingRepo();
await embeddingRepo.upsert({
  id: '...',
  doc_id: '...',
  embedding: [...],
  // ...
});

// Use Kysely directly
const db = sqliteStoreManager.getKysely();
const results = await db
  .selectFrom('doc_meta')
  .selectAll()
  .execute();
```

## Migration from better-sqlite3

This implementation replaced `better-sqlite3` to:
- ✅ Avoid native module compilation issues
- ✅ Enable cross-platform support (web/mobile)
- ✅ Simplify distribution (no node_modules required)

**Breaking Changes:**
- `WaSqliteStore.open()` is now async (was sync)
- Some operations may be slower due to syncWait overhead
- Type definitions moved to `SqliteDatabase` (was `BetterSqlite3Database`)

## Testing

When testing on different platforms:

1. **Desktop**: Current implementation works out of the box
2. **Web**: Test with OPFS VFS implementation
3. **Mobile**: Test with native file system bridge

## Implementation Optimizations

### BigInt Handling

The implementation correctly handles large integers (> 2³¹-1) by:
- Using `column_int64()` to read 64-bit integers
- Converting to `Number` only if within safe integer range (Number.MIN_SAFE_INTEGER to Number.MAX_SAFE_INTEGER)
- Keeping as `BigInt` for values outside safe range (e.g., Snowflake IDs, large timestamps)

This prevents integer overflow issues with large values.

### Blob Performance

Currently, `column_blob()` creates a copy of the data. For applications handling large binary data:
- **Current**: Memory copy on each read (acceptable for small-medium blobs)
- **Future Optimization**: Direct WASM memory access to avoid copying
  - See: [wa-sqlite blob handling](https://github.com/rhashimoto/wa-sqlite#blob-handling)
  - Useful for image indexing or large binary storage

## Build Configuration

### WASM File Handling (Base64 Inline)

The esbuild configuration uses a custom plugin to inline WASM files as Base64 data URLs:

```javascript
const wasmInlinePlugin = {
  name: 'wasm-inline',
  setup(build) {
    // Intercepts .wasm imports and converts to Base64 data URLs
    build.onResolve({ filter: /\.wasm$/ }, (args) => { /* ... */ });
    build.onLoad({ filter: /.*/, namespace: 'wasm-inline' }, async (args) => {
      const wasmBytes = await fs.promises.readFile(args.path);
      const base64 = wasmBytes.toString('base64');
      return { contents: `export default "data:application/wasm;base64,${base64}";` };
    });
  },
};
```

**Why Base64 Inline for Obsidian Plugins:**

1. **Single File Distribution**: All code and WASM bundled into `main.js`
2. **No Path Issues**: Eliminates runtime path resolution problems in Electron
3. **Simplified Deployment**: Users only need to download one JS file
4. **Works in Obsidian**: Electron renderer process can load data URLs

**How it works:**

1. **Build time**: Custom plugin intercepts `.wasm` imports
2. **Conversion**: WASM files are read and converted to Base64 strings
3. **Bundling**: Base64 data URLs are embedded in the output bundle
4. **Runtime**: wa-sqlite loads WASM from the data URL (if supported) or falls back to file system

**Bundle Size Impact:**

- `wa-sqlite.wasm`: ~500KB → ~667KB when Base64 encoded (33% overhead)
- Total bundle size increase: Acceptable for Obsidian plugins
- Trade-off: Larger bundle vs. simpler distribution

**Note**: If wa-sqlite doesn't support data URL loading directly, you may need to:
1. Extract the Base64 at runtime
2. Convert to ArrayBuffer
3. Pass to wa-sqlite's module factory

See `WaSqliteStore.ts` for implementation details.

## Future Enhancements

1. **Async API**: Full async/await support to eliminate syncWait
2. **Web VFS**: OPFS implementation for browser support
3. **Mobile VFS**: Native bridge for React Native/Capacitor
4. **Connection Pooling**: Multiple database connections for better concurrency
5. **Query Optimization**: Index tuning and query analysis
6. **WASM Memory Optimization**: Direct blob access for large binary data

## References

- [wa-sqlite Documentation](https://github.com/rhashimoto/wa-sqlite)
- [Kysely Documentation](https://kysely.dev/)
- [SQLite VFS Documentation](https://www.sqlite.org/vfs.html)

