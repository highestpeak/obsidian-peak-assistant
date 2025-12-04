import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merge Tailwind CSS classes with pktw- prefix support
 * Combines clsx for conditional classes and twMerge for Tailwind class conflicts
 */
export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

