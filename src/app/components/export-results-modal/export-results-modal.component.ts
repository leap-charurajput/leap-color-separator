import { Component, EventEmitter, Input, Output } from '@angular/core';

/*
 * A single exported file shown in the export-results modal.
 * - label: human-friendly description of the output (e.g. "Print Guide PDF").
 * - path: absolute path to the file on disk (used for "Reveal in Finder").
 * - name: file name only, derived from the path for display.
 */
export interface ExportResultFile {
	label: string;
	path: string;
	name: string;
}

@Component({
	selector: 'app-export-results-modal',
	templateUrl: './export-results-modal.component.html',
	styleUrls: ['./export-results-modal.component.css']
})
export class ExportResultsModalComponent {
	@Input() isOpen = false;
	@Input() files: ExportResultFile[] = [];
	@Input() message = 'Export process done';
	@Output() close = new EventEmitter<void>();
	/* Emits the absolute path of the file to reveal in Finder / Explorer. */
	@Output() reveal = new EventEmitter<string>();

	/*
	 * Only render rows that carry a usable path. Guards against a partially
	 * populated entry sneaking an empty link into the list.
	 */
	get displayedFiles(): ExportResultFile[] {
		return (Array.isArray(this.files) ? this.files : []).filter(
			(file) => file && String(file.path || '').trim() !== ''
		);
	}

	onReveal(file: ExportResultFile): void {
		if (file && file.path) {
			this.reveal.emit(file.path);
		}
	}

	onClose(): void {
		this.close.emit();
	}

	/* Swallow clicks inside the dialog so they do not reach the overlay handler. */
	onDialogClick(event: MouseEvent): void {
		event.stopPropagation();
	}
}
