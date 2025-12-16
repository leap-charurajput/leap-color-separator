import { Component, Input, Output, EventEmitter, OnInit, OnChanges, SimpleChanges } from '@angular/core';

@Component({
	selector: 'app-export-separations-modal',
	templateUrl: './export-separations-modal.component.html',
	styleUrls: ['./export-separations-modal.component.css']
})
export class ExportSeparationsModalComponent implements OnInit, OnChanges {
	@Input() isOpen = false;
	@Output() close = new EventEmitter<void>();
	@Output() export = new EventEmitter<any>();

	exportPrintGuide = true;
	exportSeparationsPreview = true;
	exportPostscript = true;

	ngOnInit(): void {
		this.resetCheckboxes();
	}

	ngOnChanges(changes: SimpleChanges): void {
		if (changes['isOpen'] && this.isOpen) {
			this.resetCheckboxes();
		}
	}

	private resetCheckboxes(): void {
		this.exportPrintGuide = true;
		this.exportSeparationsPreview = true;
		this.exportPostscript = true;
	}

	onExport(): void {
		const exportOptions = {
			exportPrintGuide: this.exportPrintGuide,
			exportSeparationsPreview: this.exportSeparationsPreview,
			exportPostscript: this.exportPostscript
		};
		this.export.emit(exportOptions);
		this.close.emit();
	}

	onCancel(): void {
		this.close.emit();
	}

	onOverlayClick(event: MouseEvent): void {
		event.stopPropagation();
	}

	handlePrintGuideChange(event: Event): void {
		this.exportPrintGuide = (event.target as HTMLInputElement).checked;
	}

	handleSeparationsPreviewChange(event: Event): void {
		this.exportSeparationsPreview = (event.target as HTMLInputElement).checked;
	}

	handlePostscriptChange(event: Event): void {
		this.exportPostscript = (event.target as HTMLInputElement).checked;
	}
}
