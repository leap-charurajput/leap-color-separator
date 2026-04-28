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
		}
		if (changes['selectedColors']) {
			this.selectedColorCodes = [...(this.selectedColors || [])];
		}
	}

	onColorToggle(colorCode: string): void {
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
