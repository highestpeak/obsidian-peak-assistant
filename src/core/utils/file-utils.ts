export function normalizeFilePath(path: string): string {
    return path.trim().replace(/^\/+/, '').replace(/\/+$/, '');
}

export function getFileNameFromPath(path: string): string {
    return path.trim().replace(/^\/+/, '').replace(/\/+$/, '').split('/').pop() ?? '';
}
