import { Component, Input, Output, EventEmitter, forwardRef } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

@Component({
	selector: 'app-checkbox',
	templateUrl: './checkbox.component.html',
	styleUrls: ['./checkbox.component.css'],
	providers: [
		{
			provide: NG_VALUE_ACCESSOR,
			useExisting: forwardRef(() => CheckboxComponent),
			multi: true
		}
	]
})
export class CheckboxComponent implements ControlValueAccessor {
	@Input() checked = false;
	@Input() indeterminate = false;
	@Input() label = '';
	@Input() disabled = false;
	@Input() id = '';
	@Input() name = '';
	@Input() className = '';

	@Output() change = new EventEmitter<Event>();

	private onChange = (value: boolean) => {};
	private onTouched = () => {};

	onCheckboxChange(event: Event): void {
		if (!this.disabled) {
			this.checked = (event.target as HTMLInputElement).checked;
			this.onChange(this.checked);
			this.change.emit(event);
		}
	}

	getIcon(): string {
		if (this.indeterminate) {
			return 'indeterminate';
		}
		return this.checked ? 'checked' : 'unchecked';
	}

	writeValue(value: boolean): void {
		this.checked = value;
	}

	registerOnChange(fn: (value: boolean) => void): void {
		this.onChange = fn;
	}

	registerOnTouched(fn: () => void): void {
		this.onTouched = fn;
	}

	setDisabledState(isDisabled: boolean): void {
		this.disabled = isDisabled;
	}
}
