import * as React from 'react';

export interface HiddenFileInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
	multiple?: boolean;
	accept?: string;
}

/**
 * Hidden file input component for programmatic file selection
 * Used when you want to trigger file dialog via button click rather than showing the input
 */
const HiddenFileInput = React.forwardRef<HTMLInputElement, HiddenFileInputProps>(
	({ multiple, accept, className, ...props }, ref) => {
		return (
			<input
				ref={ref}
				type="file"
				multiple={multiple}
				accept={accept}
				className="pktw-hidden"
				aria-label="Upload files"
				{...props}
			/>
		);
	}
);

HiddenFileInput.displayName = 'HiddenFileInput';

export { HiddenFileInput };