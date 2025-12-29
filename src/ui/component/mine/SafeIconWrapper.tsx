import React, { Component, ReactNode } from 'react';

/**
 * Safe wrapper for @lobehub/icons ModelIcon and ProviderIcon components
 * 
 * How to find the correct model key:
 * 
 * The model prop should match the first keyword in @lobehub/icons modelMappings
 * (with '^' prefix removed), following lobechat's approach:
 * ```javascript
 * const model = item.keywords[0].replace('^', '');
 * return <ModelIcon model={model} size={48} />;
 * ```
 * 
 * To find the correct value for a specific model:
 * 1. In browser console, run:
 *    ```javascript
 *    const icons = require('@lobehub/icons');
 *    Object.entries(icons.modelMappings).forEach(([key, value]) => {
 *      const keywords = value.keywords || [];
 *      if (keywords.some(kw => String(kw).toLowerCase().includes('gpt-5'))) {
 *        const firstKeyword = keywords[0]?.replace(/^\^/, '');
 *        console.log(`Use: "${firstKeyword}"`);
 *      }
 *    });
 *    ```
 * 2. Or check the official icons page: https://lobehub.com/icons
 * 
 * Common mappings (verified):
 * - GPT-3.5 series -> 'gpt-3.5' (from modelMappings keywords[0])
 * - GPT-4 series -> 'gpt-4' (from modelMappings keywords[0])
 * - GPT-5 series -> 'gpt-5' (from modelMappings keywords[0])
 * - O series -> 'o1' (from modelMappings keywords[0])
 */

// Try to import icons, but handle errors gracefully
let ModelIcon: any = null;
let ProviderIcon: any = null;
let iconsAvailable = false;

try {
	const iconsModule = require('@lobehub/icons');
	ModelIcon = iconsModule.ModelIcon;
	ProviderIcon = iconsModule.ProviderIcon;
	// Mark as available if icons are loaded
	iconsAvailable = !!(ModelIcon && ProviderIcon);
} catch (error) {
	// Silently fail - icons will not be available
	console.debug('[SafeIconWrapper] Failed to import @lobehub/icons:', error);
	iconsAvailable = false;
}

interface SafeIconWrapperProps {
	type: 'model' | 'provider';
	value: string;
	size?: number;
	className?: string;
	fallback?: ReactNode;
}

interface SafeIconWrapperState {
	hasError: boolean;
}

/**
 * Safe wrapper for ModelIcon and ProviderIcon components
 * Catches errors from @lobehub/icons that may occur due to React version incompatibility
 * Since ErrorBoundary cannot catch hook errors, we try to render anyway and let global error handler catch it
 */
class SafeIconInner extends Component<
	{ type: 'model' | 'provider'; value: string; size?: number; className?: string; fallback?: ReactNode },
	SafeIconWrapperState
> {
	constructor(props: SafeIconInner['props']) {
		super(props);
		this.state = { hasError: false };
	}

	static getDerivedStateFromError() {
		return { hasError: true };
	}

	componentDidCatch(error: Error) {
		// Silently handle the error - but still try to render
		console.debug('[SafeIconWrapper] Icon rendering error:', error.message);
	}

	render() {
		// If we've caught an error via ErrorBoundary, return fallback
		if (this.state.hasError) {
			return this.props.fallback || null;
		}

		// If icons are not available at all, return fallback
		if (!iconsAvailable) {
			return this.props.fallback || null;
		}

		const { type, value, size, className, fallback } = this.props;

		// If icons are not available, return fallback
		if (type === 'model' && !ModelIcon) {
			return fallback || null;
		}
		if (type === 'provider' && !ProviderIcon) {
			return fallback || null;
		}

		// Try to render the icon component
		// Even if there's a hook error, we'll let it render and catch via global error handler
		try {
			if (type === 'model' && ModelIcon) {
				return React.createElement(ModelIcon, { model: value, size, className });
			} else if (type === 'provider' && ProviderIcon) {
				return React.createElement(ProviderIcon, { provider: value, size, className });
			}
		} catch (error) {
			// If rendering fails synchronously, return fallback
			return fallback || null;
		}

		return fallback || null;
	}
}

// Set up global error handler to silently catch @lobehub/icons hook errors
// This runs once when the module is loaded
if (typeof window !== 'undefined' && !(window as any).__lobehubIconsErrorHandlerInstalled) {
	(window as any).__lobehubIconsErrorHandlerInstalled = true;
	
	const originalErrorHandler = window.onerror;
	const originalUnhandledRejection = window.onunhandledrejection;
	
	window.onerror = function(message, source, lineno, colno, error) {
		// Check if this is the @lobehub/icons use hook error
		if (
			typeof message === 'string' && 
			(message.includes('use') && message.includes('is not a function')) &&
			(typeof source === 'string' && source.includes('obsidian-peak-assistant'))
		) {
			// Silently ignore this specific error
			return true; // Prevent default error handling
		}
		// Call original error handler for other errors
		if (originalErrorHandler) {
			return originalErrorHandler.call(this, message, source, lineno, colno, error);
		}
		return false;
	};

	// Also handle unhandled promise rejections
	window.addEventListener('unhandledrejection', function(event) {
		if (
			event.reason && 
			typeof event.reason === 'object' &&
			event.reason.message &&
			event.reason.message.includes('use') &&
			event.reason.message.includes('is not a function')
		) {
			event.preventDefault();
		}
	});
}

/**
 * Wrapper component that provides fallback UI
 */
export function SafeIconWrapper({ type, value, size, className, fallback }: SafeIconWrapperProps) {
	// If icons are not available, don't even try to render
	if (!iconsAvailable) {
		return fallback || null;
	}

	return (
		<SafeIconInner type={type} value={value} size={size} className={className} fallback={fallback} />
	);
}

/**
 * Functional component wrapper for SafeIconWrapper - ModelIcon
 */
export function SafeModelIcon({
	model,
	size,
	className,
	fallback,
}: {
	model: string;
	size?: number;
	className?: string;
	fallback?: ReactNode;
}) {
	return (
		<SafeIconWrapper
			type="model"
			value={model}
			size={size}
			className={className}
			fallback={fallback}
		/>
	);
}

/**
 * Functional component wrapper for SafeIconWrapper - ProviderIcon
 */
export function SafeProviderIcon({
	provider,
	size,
	className,
	fallback,
}: {
	provider: string;
	size?: number;
	className?: string;
	fallback?: ReactNode;
}) {
	return (
		<SafeIconWrapper
			type="provider"
			value={provider}
			size={size}
			className={className}
			fallback={fallback}
		/>
	);
}

