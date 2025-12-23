export function trimTrailingSlash(url: string): string {
	return url.endsWith('/') ? url.slice(0, -1) : url;
}

export async function safeReadError(response: Response): Promise<string> {
	try {
		return await response.text();
	} catch (error) {
		console.warn('Failed to read error response', error);
		return '';
	}
}

