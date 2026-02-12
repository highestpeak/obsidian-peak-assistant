/**
 * Define a supplier function type.
 */
export type Supplier<T> = () => T;

/**
 * Wrap the supplier function into a cached version.
 * eg: usually to ensure that an expensive calculation, database query, or API call is executed only once and the cached result is returned in subsequent calls.
 */
export function memoizeSupplier<T>(supplier: Supplier<T>): Supplier<T> {
    let cache: T | undefined;
    let isComputed = false;

    return () => {
        if (!isComputed) {
            cache = supplier();
            isComputed = true;
        }
        return cache as T;
    };
}

/**
 * eg: Suppose you have a configuration item, only when the VERSION environment variable changes, the configuration is reloaded.
 */
export function refreshableMemoizeSupplier<T, STATE>(
    supplier: Supplier<T>,
    stateProvider: () => STATE,
    checkIsChanged: (lastState: STATE | undefined, currentState: STATE) => boolean
): Supplier<T> {
    let cache: T | undefined;
    let lastState: STATE | undefined;
    let isComputed = false;

    return () => {
        const currentState = stateProvider();

        // if is the first run, or checkIsChanged returns true, then refresh the cache
        if (!isComputed || checkIsChanged(lastState, currentState)) {
            cache = supplier();
            lastState = currentState;
            isComputed = true;
        }

        return cache as T;
    };
}
