

export function isBlankString(value?: any): boolean {
    return value === undefined || value === null || value.trim() === '';
}

/**
 * @returns default return empty string.
 */
export function ifStringNoBlankThenConcat(params: { prefix?: string, value: any, suffix?: string, arrayValueSeparator?: string }): string {
    const { prefix, value, suffix, arrayValueSeparator } = params;
    if (Array.isArray(value)) {
        return (prefix ?? '') + value.join(arrayValueSeparator ?? '\n') + (suffix ?? '');
    }
    if (isBlankString(value)) {
        return '';
    }
    return (prefix ?? '') + value + (suffix ?? '');
}