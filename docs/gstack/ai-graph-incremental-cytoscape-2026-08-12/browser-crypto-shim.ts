export function createHash(): never {
	throw new Error('Node crypto is unavailable in this design-only browser mock.');
}
