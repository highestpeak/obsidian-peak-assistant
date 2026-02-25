import React, { ReactNode } from 'react';
import { Bot, Server } from 'lucide-react';

/**
 * Local model/provider icons (no @lobehub/icons or antd). Uses lucide-react.
 */

interface SafeIconWrapperProps {
	type: 'model' | 'provider';
	value: string;
	size?: number;
	className?: string;
	fallback?: ReactNode;
}

function LocalIcon({
	type,
	size = 20,
	className,
}: {
	type: 'model' | 'provider';
	size?: number;
	className?: string;
}) {
	const s = size ?? 20;
	if (type === 'model') {
		return <Bot size={s} className={className} style={{ width: s, height: s, flexShrink: 0 }} />;
	}
	return <Server size={s} className={className} style={{ width: s, height: s, flexShrink: 0 }} />;
}

export function SafeIconWrapper({ type, value, size, className, fallback }: SafeIconWrapperProps) {
	if (!value && fallback) return <>{fallback}</>;
	return <LocalIcon type={type} size={size} className={className} />;
}

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

/** No-op: kept for plugin lifecycle compatibility. */
export function installIconErrorHandlers(): () => void {
	return () => {};
}
