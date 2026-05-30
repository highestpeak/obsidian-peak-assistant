import * as React from 'react';
import { cn } from '@/ui/react/lib/utils';

export interface FormRowProps extends React.HTMLAttributes<HTMLDivElement> {
	/** Stack label + control vertically instead of side-by-side. */
	stack?: boolean;
}

/** Form row container — applies `.pk-form-row` with optional `--stack` variant. */
const FormRowRoot = React.forwardRef<HTMLDivElement, FormRowProps>(
	({ className, stack, ...props }, ref) => (
		<div
			ref={ref}
			className={cn(
				'pk-form-row',
				stack && 'pk-form-row--stack',
				className
			)}
			{...props}
		/>
	)
);
FormRowRoot.displayName = 'FormRow';

const FormLabel = React.forwardRef<
	HTMLLabelElement,
	React.LabelHTMLAttributes<HTMLLabelElement>
>(({ className, ...props }, ref) => (
	<label
		ref={ref}
		className={cn('pk-form-label', className)}
		{...props}
	/>
));
FormLabel.displayName = 'FormRow.Label';

const FormLabelHint = React.forwardRef<
	HTMLSpanElement,
	React.HTMLAttributes<HTMLSpanElement>
>(({ className, ...props }, ref) => (
	<span
		ref={ref}
		className={cn('pk-form-label__hint', className)}
		{...props}
	/>
));
FormLabelHint.displayName = 'FormRow.LabelHint';

const FormControl = React.forwardRef<
	HTMLDivElement,
	React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
	<div
		ref={ref}
		className={cn('pk-form-control', className)}
		{...props}
	/>
));
FormControl.displayName = 'FormRow.Control';

const FormControlHint = React.forwardRef<
	HTMLSpanElement,
	React.HTMLAttributes<HTMLSpanElement>
>(({ className, ...props }, ref) => (
	<span
		ref={ref}
		className={cn('pk-form-control__hint', className)}
		{...props}
	/>
));
FormControlHint.displayName = 'FormRow.ControlHint';

export interface FormInputProps
	extends React.InputHTMLAttributes<HTMLInputElement> {
	/** Use sans-serif font (default is mono per design). */
	sans?: boolean;
}

const FormInput = React.forwardRef<HTMLInputElement, FormInputProps>(
	({ className, sans, ...props }, ref) => (
		<input
			ref={ref}
			className={cn(
				'pk-form-input',
				sans && 'pk-form-input--sans',
				className
			)}
			{...props}
		/>
	)
);
FormInput.displayName = 'FormRow.Input';

const FormSelect = React.forwardRef<
	HTMLSelectElement,
	React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, ...props }, ref) => (
	<select
		ref={ref}
		className={cn('pk-form-select', className)}
		{...props}
	/>
));
FormSelect.displayName = 'FormRow.Select';

const FormTextarea = React.forwardRef<
	HTMLTextAreaElement,
	React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
	<textarea
		ref={ref}
		className={cn('pk-form-textarea', className)}
		{...props}
	/>
));
FormTextarea.displayName = 'FormRow.Textarea';

export interface FormSliderProps
	extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
	/** Override the right-edge value readout (defaults to current value). */
	displayValue?: React.ReactNode;
}

const FormSlider = React.forwardRef<HTMLInputElement, FormSliderProps>(
	({ className, displayValue, value, ...props }, ref) => (
		<div className={cn('pk-form-slider', className)}>
			<input ref={ref} type="range" value={value} {...props} />
			<span className="pk-form-slider__value">
				{displayValue ?? value}
			</span>
		</div>
	)
);
FormSlider.displayName = 'FormRow.Slider';

export interface FormNumberProps
	extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
	/** Optional unit label rendered to the right of the input. */
	unit?: string;
	/** ClassName for the outer `<div class="pk-form-number">` wrapper. */
	wrapperClassName?: string;
}

const FormNumber = React.forwardRef<HTMLInputElement, FormNumberProps>(
	({ className, wrapperClassName, unit, ...props }, ref) => (
		<div className={cn('pk-form-number', wrapperClassName)}>
			<input ref={ref} type="number" className={className} {...props} />
			{unit ? <span className="pk-form-number__unit">{unit}</span> : null}
		</div>
	)
);
FormNumber.displayName = 'FormRow.Number';

export const FormRow = Object.assign(FormRowRoot, {
	Label: FormLabel,
	LabelHint: FormLabelHint,
	Control: FormControl,
	ControlHint: FormControlHint,
	Input: FormInput,
	Select: FormSelect,
	Textarea: FormTextarea,
	Slider: FormSlider,
	Number: FormNumber,
});

/** Vertical stack of FormRows — applies `.pk-form-grid`. */
export const FormGrid = React.forwardRef<
	HTMLDivElement,
	React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
	<div ref={ref} className={cn('pk-form-grid', className)} {...props} />
));
FormGrid.displayName = 'FormGrid';
