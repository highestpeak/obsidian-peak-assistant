/**
 * Packed bitsets as `Uint32Array` (32 bits per word, little-endian bit order within each word).
 */

/** Word count for a bitset of given length. */
export function uint32BitsetWordCount(bitLength: number): number {
	return Math.ceil(Math.max(0, bitLength) / 32);
}

/** Allocates a zeroed bitset large enough for `bitLength` bits. */
export function createUint32Bitset(bitLength: number): Uint32Array {
	return new Uint32Array(uint32BitsetWordCount(bitLength));
}

/** Sets bit at `bitIndex` (0-based). */
export function setUint32Bit(bits: Uint32Array, bitIndex: number): void {
	const wi = bitIndex >>> 5;
	const mask = 1 << (bitIndex & 31);
	bits[wi] |= mask;
}

/** Whether bit at `bitIndex` is set. */
export function hasUint32Bit(bits: Uint32Array, bitIndex: number): boolean {
	const wi = bitIndex >>> 5;
	const mask = 1 << (bitIndex & 31);
	return ((bits[wi] ?? 0) & mask) !== 0;
}

/** Population count of the lower 32 bits of `x` (treated as unsigned). */
export function popcountUint32(x: number): number {
	x >>>= 0;
	x -= (x >>> 1) & 0x55555555;
	x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
	return (((x + (x >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
}

/** Total number of set bits in the whole bitset. */
export function countBitsUint32(bits: Uint32Array): number {
	let t = 0;
	for (let i = 0; i < bits.length; i++) t += popcountUint32(bits[i] ?? 0);
	return t;
}

/**
 * Fraction of bits in `candidate` that are not yet in `covered`:
 * |candidate & ~covered| / max(1, |candidate|).
 */
export function fractionOfBitsNewSince(candidate: Uint32Array, covered: Uint32Array): number {
	let candidateCount = 0;
	let newCount = 0;
	const n = Math.min(candidate.length, covered.length);
	for (let i = 0; i < n; i++) {
		const c = candidate[i] ?? 0;
		const cov = covered[i] ?? 0;
		candidateCount += popcountUint32(c);
		newCount += popcountUint32(c & ~cov);
	}
	return newCount / Math.max(1, candidateCount);
}

/** Count of bits set in `candidate` but not yet in `covered` (unique new documents). */
export function countBitsNewSince(candidate: Uint32Array, covered: Uint32Array): number {
	let newCount = 0;
	const n = Math.min(candidate.length, covered.length);
	for (let i = 0; i < n; i++) {
		newCount += popcountUint32((candidate[i] ?? 0) & ~(covered[i] ?? 0));
	}
	return newCount;
}

/**
 * Intersection size over min(set size a, set size b), as bit counts; 0 if disjoint.
 */
export function overlapRatioMinUint32(a: Uint32Array, b: Uint32Array): number {
	let inter = 0;
	let ca = 0;
	let cb = 0;
	const n = Math.max(a.length, b.length);
	for (let i = 0; i < n; i++) {
		const va = a[i] ?? 0;
		const vb = b[i] ?? 0;
		inter += popcountUint32(va & vb);
		ca += popcountUint32(va);
		cb += popcountUint32(vb);
	}
	if (inter === 0) return 0;
	const den = Math.min(ca, cb);
	return den > 0 ? inter / den : 0;
}
