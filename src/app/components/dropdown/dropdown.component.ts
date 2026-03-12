import { Component, Input, Output, EventEmitter, ElementRef, ViewChild, OnChanges, SimpleChanges, ChangeDetectorRef } from '@angular/core';
import { ConnectedPosition } from '@angular/cdk/overlay';

@Component({
	selector: 'app-dropdown',
	templateUrl: './dropdown.component.html',
	styleUrls: ['./dropdown.component.css']
})
export class DropdownComponent implements OnChanges {
	@Input() label?: string;
	@Input() value?: string;
	@Input() items: string[] = [];
	@Input() placeholder = 'Pick document...';
	@Input() disabled = false;
	@Output() onChange = new EventEmitter<string>();

	@ViewChild('dropdownOrigin', { read: ElementRef }) dropdownOrigin!: ElementRef;

	isOpen = false;
	selectedValue = '';
	dropdownWidth = 0;
	private lastOpenTime = 0;
	positions: ConnectedPosition[] = [
		{
			originX: 'start',
			originY: 'bottom',
			overlayX: 'start',
			overlayY: 'top',
			offsetY: 0
		}
	];

	constructor(private cdr: ChangeDetectorRef) { }

	ngOnChanges(changes: SimpleChanges): void {
		if (changes['value'] && changes['value'].currentValue !== undefined) {
			this.selectedValue = changes['value'].currentValue;
		}
		if (changes['items']) {
			this.cdr.detectChanges();
		}
	}

	get displayValue(): string {
		return this.selectedValue || this.placeholder;
	}

	handleToggle(event: Event): void {
		if (this.disabled) return;
		event.stopPropagation();
		event.preventDefault();

		if (!this.isOpen) {
			// Mark width of the trigger to match dropdown width
			const rect = this.dropdownOrigin.nativeElement.getBoundingClientRect();
			this.dropdownWidth = rect.width;
		}

		this.isOpen = !this.isOpen;
		if (this.isOpen) {
			this.lastOpenTime = Date.now();
		}
		this.cdr.detectChanges();
	}

	handleItemClick(item: string, event?: Event): void {
		if (event) {
			event.stopPropagation();
			event.preventDefault();
		}
		this.selectedValue = item;
		this.isOpen = false;
		this.onChange.emit(item);
		this.cdr.detectChanges();
	}

	onBackdropClick(): void {
		// Ignore backdrop clicks within 150ms of opening - prevents the opening click
		// from being treated as a backdrop click (CDK overlay known behavior)
		if (Date.now() - this.lastOpenTime < 150) {
			return;
		}
		this.isOpen = false;
		this.cdr.detectChanges();
	}
}
