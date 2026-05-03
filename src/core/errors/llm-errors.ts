export class AuthenticationError extends Error {
    constructor(message: string, public readonly provider?: string) {
        super(message);
        this.name = 'AuthenticationError';
    }
}

export class LLMResponseError extends Error {
    constructor(message: string, public readonly rawResponse?: string) {
        super(message);
        this.name = 'LLMResponseError';
    }
}

export class MaxTurnsError extends Error {
    constructor(message: string, public readonly partialText?: string) {
        super(message);
        this.name = 'MaxTurnsError';
    }
}

/**
 * Detect common error patterns in SDK result messages and throw typed errors.
 */
export function throwTypedError(errorText: string, partialText?: string): never {
    const lower = errorText.toLowerCase();
    if (lower.includes('authentication') || lower.includes('invalid bearer') || lower.includes('401')) {
        throw new AuthenticationError(
            'API key is invalid or expired. Please update your credentials in Settings → Profiles.',
        );
    }
    if (lower.includes('maximum number of turns')) {
        throw new MaxTurnsError(
            'Analysis reached maximum depth. Partial results may be available.',
            partialText,
        );
    }
    throw new LLMResponseError(errorText);
}
