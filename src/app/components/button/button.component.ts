import { Component, Input, Output, EventEmitter } from '@angular/core';

@Component({
	selector: 'app-button',
	templateUrl: './button.component.html',
	styleUrls: ['./button.component.css']
})
export class ButtonComponent {
	@Input() variant: 'primary' | 'secondary' | 'danger' | 'success' = 'primary';
	@Input() size: 'small' | 'medium' | 'large' = 'medium';
	@Input() disabled = false;
	@Input() fullWidth = false;
	@Input() icon?: string;
	@Input() iconPosition: 'left' | 'right' = 'left';
	@Input() className = '';
	@Input() type: 'button' | 'submit' | 'reset' = 'button';
	@Output() onClick = new EventEmitter<Event>();

	handleClick(event: Event): void {
		if (!this.disabled) {
			this.onClick.emit(event);
		}
	}

	get buttonClasses(): string {
		const classes = [
			'ai-button',
			`ai-button--${this.variant}`,
			`ai-button--${this.size}`,
			this.fullWidth ? 'ai-button--full-width' : '',
			this.disabled ? 'ai-button--disabled' : '',
			this.className
		].filter(Boolean).join(' ');
		return classes;
	}
}
