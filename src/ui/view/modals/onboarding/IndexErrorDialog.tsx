// src/ui/view/modals/onboarding/IndexErrorDialog.tsx

import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/ui/component/shared-ui/button';
import type { IndexErrorAction } from '@/service/search/index/indexInitializer';

type Props = {
	step: string;
	failedCount: number;
	errorMessage: string;
	onAction: (action: IndexErrorAction) => void;
};

export function IndexErrorDialog({ step, failedCount, errorMessage, onAction }: Props) {
	return (
		<div className="pktw-flex pktw-flex-col pktw-gap-4 pktw-py-4">
			<div className="pktw-flex pktw-items-center pktw-gap-2">
				<AlertTriangle className="pktw-w-4 pktw-h-4 pktw-text-[--text-warning] pktw-shrink-0" />
				<span className="pktw-text-sm pktw-font-medium pktw-text-[--text-normal]">
					{step}
				</span>
			</div>

			<span className="pktw-text-xs pktw-text-[--text-muted]">
				{failedCount} {failedCount === 1 ? 'file' : 'files'} failed
			</span>

			<pre
				className="pktw-text-xs pktw-p-2.5 pktw-rounded-md pktw-overflow-auto pktw-max-h-24 pktw-font-mono pktw-text-[--text-normal] pktw-border pktw-border-[--background-modifier-border]"
				style={{ background: 'var(--background-primary-alt)' }}
			>
				{errorMessage}
			</pre>

			<div className="pktw-flex pktw-gap-2 pktw-justify-end">
				<Button variant="ghost" size="sm" onClick={() => onAction('continue')}>
					Continue without
				</Button>
				<Button variant="outline" size="sm" onClick={() => onAction('retry')}>
					Retry
				</Button>
				<Button variant="outline" size="sm" onClick={() => onAction('cancel')}>
					Cancel
				</Button>
			</div>
		</div>
	);
}
