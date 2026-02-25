export function normalizeFilePath(path: string): string {
    return path.trim().replace(/^\/+/, '').replace(/\/+$/, '');
}

/** Extracts file name from path. Handles undefined/null. */
export function getFileNameFromPath(path: string | undefined | null): string {
    const s = String(path ?? '').trim();
    return s.replace(/^\/+/, '').replace(/\/+$/, '').split('/').pop() ?? '';
}
