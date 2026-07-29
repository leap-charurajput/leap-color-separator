import { Component, EventEmitter, Input, Output, OnInit, OnChanges, SimpleChanges } from '@angular/core';
import { PostscriptReadinessIssue } from '../postscript-setup-alert/postscript-setup-alert.component';
import { ControllerService } from '../../services/controller.service';

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

	constructor(private controller: ControllerService) {}

	ngOnInit(): void {
		this.resetCheckboxes();
	}

	ngOnChanges(changes: SimpleChanges): void {
		if (changes['isOpen'] && this.isOpen) {
			this.resetCheckboxes();
			this.prefillControlAndVersionFromDocument();
		}
	}

	private resetCheckboxes(): void {
		this.exportPrintGuide = true;
		this.exportPostscript = this.postscriptReady;
		this.controlNumber = '';
		this.versionNumber = '';
	}

	/*
	 * On open, pre-fill Control number / Version number from the active Illustrator document. On a repeat
	 * export the values live in the text frames named CONTROL_NUMBER / VERSION_NUMBER, so read those and
	 * populate the fields. Bracketed placeholder tokens (e.g. "[CONTROL]", "[V#]") and blanks are ignored.
	 */
	private prefillControlAndVersionFromDocument(): void {
		if (typeof (this.controller as any)?.getControlAndVersionNumbers !== 'function') {
			return;
		}
		Promise.resolve(this.controller.getControlAndVersionNumbers())
			.then((res: any) => {
				if (!res || res.success === false) {
					return;
				}
				const clean = (value: any): string => {
					const v = value == null ? '' : String(value).trim();
					return v !== '' && !/^\[.*\]$/.test(v) ? v : '';
				};
				const control = clean(res.controlNumber);
				const version = clean(res.versionNumber);
				if (control !== '') {
					this.controlNumber = control;
				}
				if (version !== '') {
					this.versionNumber = version;
				}
			})
			.catch(() => {});
	}

	handleVersionNumberChange(event: Event): void {
		this.versionNumber = (event.target as HTMLInputElement).value;
	}

	/*
	 * Export is always allowed; Control number and Version number are optional. When left blank they are
	 * not written to the document (the writer skips empty values, so any existing frame value is kept).
	 */
	get canExport(): boolean {
		return true;
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
