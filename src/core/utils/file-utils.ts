export function normalizeFilePath(path: string): string {
    return path.trim().replace(/^\/+/, '').replace(/\/+$/, '');
}

/** Last path segment after the final `/` (vault-style paths). */
export function basenameFromPath(path: string): string {
    if (!path) return '';
    const i = path.lastIndexOf('/');
    return i >= 0 ? path.slice(i + 1) : path;
}

/** Parent directory path (vault-style): everything before the last `/`; empty if none or root-only. */
export function folderPrefixOfPath(path: string): string {
    const i = path.lastIndexOf('/');
    return i > 0 ? path.slice(0, i) : '';
}

/** Extracts file name from path. Handles undefined/null. */
export function getFileNameFromPath(path: string | undefined | null): string {
    const s = String(path ?? '').trim();
    return s.replace(/^\/+/, '').replace(/\/+$/, '').split('/').pop() ?? '';
}
