
/**
 * Utility function for Map.
 * Returns all values for the given keys that exist in the map, in the same order as keys.
 * @param map - Map to get from
 * @param keys - Array of keys to fetch
 */
export function mapGetAll<K, V>(map: Map<K, V>, keys: K[]): V[] {
    const result: V[] = [];
    for (const key of keys) {
        if (map.has(key)) {
            result.push(map.get(key)!);
        }
    }
    return result;
}

export const EMPTY_SET = new Set<string>();
export const EMPTY_MAP = new Map();

export function emptyMap<K, V>(): Map<K, V> {
    return EMPTY_MAP as Map<K, V>;
}
