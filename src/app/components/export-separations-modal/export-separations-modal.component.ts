import { Component, EventEmitter, Input, Output, OnInit, OnChanges, SimpleChanges } from '@angular/core';
import { PostscriptReadinessIssue } from '../postscript-setup-alert/postscript-setup-alert.component';

@Component({
	selector: 'app-export-separations-modal',
	templateUrl: './export-separations-modal.component.html',
	styleUrls: ['./export-separations-modal.component.css']
})
export class ExportSeparationsModalComponent implements OnInit, OnChanges {
	@Input() isOpen = false;
	@Input() postscriptReady = true;
	@Input() postscriptIssues: PostscriptReadinessIssue[] = [];
	@Output() close = new EventEmitter<void>();
	@Output() export = new EventEmitter<any>();

	exportPrintGuide = true;
	/** Export Postscript (.ps) and Separations Preview PDF (Distiller) together. */
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
		this.exportPostscript = this.postscriptReady;
	}

	onExport(): void {
		const exportOptions = {
			exportPrintGuide: this.exportPrintGuide,
			exportPostscript: this.postscriptReady ? this.exportPostscript : false
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

	handlePostscriptChange(event: Event): void {
		this.exportPostscript = (event.target as HTMLInputElement).checked;
	}
}
