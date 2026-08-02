export function generatedOutputDirectory(path: string): string {
	const index = path.lastIndexOf('/');
	return index < 0 ? '' : path.slice(0, index);
}
export function assertSafeGeneratedOutputFilename(value: string, label: string): string {
	const trimmed = value.trim();
	if (!trimmed || trimmed === '.' || trimmed === '..' || /[\\/]/.test(trimmed)) {
		throw new Error(`Generated output ${label} is not a safe filename: "${value}".`);
	}
	return trimmed;
}

export function generatedOutputRecoverySuffix(now: string, sequence: number): string {
	const normalized = now.replace(/[^0-9A-Za-z]+/g, '-').replace(/^-+|-+$/g, '');
	return `${normalized || 'unknown-time'}-${sequence}`;
}
