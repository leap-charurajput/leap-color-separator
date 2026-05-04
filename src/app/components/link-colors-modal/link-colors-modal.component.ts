import { Component, Input, Output, EventEmitter, OnInit, OnChanges, SimpleChanges } from '@angular/core';

@Component({
	selector: 'app-link-colors-modal',
	templateUrl: './link-colors-modal.component.html',
	styleUrls: ['./link-colors-modal.component.css']
})
export class LinkColorsModalComponent implements OnInit, OnChanges {
	@Input() isOpen = false;
	@Input() graphicName = '';
	@Input() availableColors: string[] = [];
	@Input() selectedColors: string[] = [];
	@Input() isLoadingColors = false;

	@Output() close = new EventEmitter<void>();
	@Output() save = new EventEmitter<string[]>();

	selectedColorCodes: string[] = [];

	ngOnInit(): void {
		this.selectedColorCodes = [...(this.selectedColors || [])];
	}

	ngOnChanges(changes: SimpleChanges): void {
		if (changes['isOpen'] && this.isOpen) {
			this.selectedColorCodes = [...(this.selectedColors || [])];
			console.log(
				'[LinkColorsModal] Modal opened — each checkbox row = one entry from @Input availableColors (parent loads via getColorCodesFromExcel)',
				{
					graphicName: this.graphicName,
					availableColors: [...(this.availableColors || [])],
					selectedColorCodes: [...this.selectedColorCodes],
					isLoadingColors: this.isLoadingColors
				}
			);
		}
		if (changes['selectedColors']) {
			this.selectedColorCodes = [...(this.selectedColors || [])];
		}
		if (changes['availableColors'] && this.isOpen) {
			console.log(
				'[LinkColorsModal] availableColors @Input updated → *ngFor renders one app-checkbox per string (label = color code)',
				{
					count: (this.availableColors || []).length,
					codes: [...(this.availableColors || [])],
					isLoadingColors: this.isLoadingColors
				}
			);
		}
	}

	onColorToggle(colorCode: string, event?: Event): void {
		const isChecked = (event?.target as HTMLInputElement | null)?.checked;
		if (typeof isChecked === 'boolean') {
			if (isChecked) {
				if (!this.selectedColorCodes.includes(colorCode)) {
					this.selectedColorCodes = [...this.selectedColorCodes, colorCode];
				}
			} else {
				this.selectedColorCodes = this.selectedColorCodes.filter(c => c !== colorCode);
			}
			return;
		}

		// Fallback path when event target is unavailable.
		if (this.selectedColorCodes.includes(colorCode)) {
			this.selectedColorCodes = this.selectedColorCodes.filter(c => c !== colorCode);
		} else {
			this.selectedColorCodes = [...this.selectedColorCodes, colorCode];
		}
	}

	onOk(): void {
		this.save.emit([...this.selectedColorCodes]);
		this.close.emit();
	}

	onCancel(): void {
		this.close.emit();
	}

	onOverlayClick(event: MouseEvent): void {
		event.stopPropagation();
	}
}
