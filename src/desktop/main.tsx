import React from 'react';
import ReactDOM from 'react-dom/client';
import { DesktopApp } from './App';
// Import the same styles as Obsidian plugin uses
// These match the styles.css file that Obsidian loads
import '@/styles/tailwind.css';
import '@/styles/streamdown.css';
import * as cryptoMock from './mocks/libs/crypto-mock';

// Setup require mock for browser environment
if (typeof window !== 'undefined' && typeof (window as any).require === 'undefined') {
	// Create a basic require function that uses mocks
	(window as any).require = (moduleName: string) => {
		if (moduleName === 'crypto') {
			return cryptoMock;
		}
		if (moduleName === 'mammoth') {
			return {
				extractRawText: async () => ({ value: '' }),
			};
		}
		if (moduleName === 'officeparser') {
			return {
				parseOfficeAsync: async () => '',
			};
		}
		console.warn(`Module "${moduleName}" not available in browser, returning empty mock`);
		return {};
	};
}

/**
 * Entry point for desktop development
 */
const root = document.getElementById('root');
if (!root) {
	throw new Error('Root element not found');
}

ReactDOM.createRoot(root).render(
	<React.StrictMode>
		<DesktopApp />
	</React.StrictMode>
);

