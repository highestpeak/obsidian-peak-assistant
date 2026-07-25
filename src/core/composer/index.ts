/**
 * Peak Composer — core domain barrel (framework-neutral types + id/section
 * helpers). The service and app layers import the model from here; the UI
 * imports the read-only types for rendering.
 */
export * from './types';
export * from './ids';
export * from './sections';
export * from './operations';
export * from './transaction';
export * from './transactionConfig';
export * from './capabilityContracts';
export * from './capabilityRuntime';
