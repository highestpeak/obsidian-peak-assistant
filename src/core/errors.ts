/**
 * Business error codes for application errors
 */
export enum ErrorCode {
	MODEL_UNAVAILABLE = 'MODEL_UNAVAILABLE',
	PROVIDER_NOT_FOUND = 'PROVIDER_NOT_FOUND',
	CONFIGURATION_MISSING = 'CONFIGURATION_MISSING',
	SQLITE_VEC_EXTENSION_NOT_LOADED = 'SQLITE_VEC_EXTENSION_NOT_LOADED',
	VEC_EMBEDDINGS_TABLE_MISSING = 'VEC_EMBEDDINGS_TABLE_MISSING',
	UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}

/**
 * Default error message when model/service is unavailable
 */
export const MODEL_UNAVAILABLE_MESSAGE = 'Model is currently unavailable. Please check your settings and ensure the provider is properly configured.';

/**
 * Custom error class for business errors
 */
export class BusinessError extends Error {
	constructor(
		public readonly code: ErrorCode,
		message: string,
		cause?: Error
	) {
		super(message);
		this.name = 'BusinessError';
		if (cause) {
			this.cause = cause;
		}
	}
}

/**
 * Get user-friendly error message from an error
 */
export function getErrorMessage(error: unknown): string {
	if (error instanceof BusinessError) {
		if (error.code === ErrorCode.MODEL_UNAVAILABLE || 
			error.code === ErrorCode.CONFIGURATION_MISSING ||
			error.code === ErrorCode.PROVIDER_NOT_FOUND) {
			return MODEL_UNAVAILABLE_MESSAGE;
		}
		return error.message;
	}
	
	if (error instanceof Error) {
		return error.message;
	}
	
	return String(error);
}

