import { createHash } from 'crypto';

export function canonicalJson(value: unknown): string {
	const seen = new Set<object>();
	const serialized = serializeCanonical(value, seen);
	if (serialized === undefined) {
		throw new Error('Generated output payload is not JSON-serializable.');
	}
	return serialized;
}
export function sha256Text(value: string): string {
	return createHash('sha256').update(value, 'utf8').digest('hex');
}

export function sha256Bytes(value: Uint8Array): string {
	return createHash('sha256').update(value).digest('hex');
}

function serializeCanonical(value: unknown, seen: Set<object>): string | undefined {
	if (value === null) return 'null';
	if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
	if (typeof value === 'number') return Number.isFinite(value) ? JSON.stringify(value) : 'null';
	if (typeof value === 'bigint') throw new Error('Generated output payload cannot contain bigint values.');
	if (typeof value === 'undefined' || typeof value === 'function' || typeof value === 'symbol') return undefined;
	if (typeof value !== 'object') return undefined;
	if (seen.has(value)) throw new Error('Generated output payload cannot contain circular references.');
	seen.add(value);
	try {
		if (Array.isArray(value)) {
			const items = value.map((item) => serializeCanonical(item, seen) ?? 'null');
			return `[${items.join(',')}]`;
		}
		const source = value as Record<string, unknown>;
		const entries = Object.keys(source)
			.sort()
			.flatMap((key) => {
				const item = serializeCanonical(source[key], seen);
				return item === undefined ? [] : [`${JSON.stringify(key)}:${item}`];
			});
		return `{${entries.join(',')}}`;
	} finally {
		seen.delete(value);
	}
}
