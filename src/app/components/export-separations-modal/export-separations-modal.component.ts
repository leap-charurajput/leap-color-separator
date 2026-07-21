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
	/** Control number entered by the user; written into the doc's [CONTROL] / Control_Number frame before export. */
	controlNumber = '';
	/** Version number entered by the user; written into the doc's [V#] / Version_Number frame before export. */
	versionNumber = '';

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
		this.controlNumber = '';
		this.versionNumber = '';
	}

	handleVersionNumberChange(event: Event): void {
		this.versionNumber = (event.target as HTMLInputElement).value;
	}

	/** Export is allowed only when BOTH the control number and version number are provided. */
	get canExport(): boolean {
		return (this.controlNumber || '').trim() !== '' && (this.versionNumber || '').trim() !== '';
	}

	handleControlNumberChange(event: Event): void {
		this.controlNumber = (event.target as HTMLInputElement).value;
	}

	onExport(): void {
		if (!this.canExport) {
			return;
		}
		const exportOptions = {
			exportPrintGuide: this.exportPrintGuide,
			exportPostscript: this.postscriptReady ? this.exportPostscript : false,
			controlNumber: (this.controlNumber || '').trim(),
			versionNumber: (this.versionNumber || '').trim()
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
