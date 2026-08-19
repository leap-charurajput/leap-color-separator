import { Component, EventEmitter, Input, Output, OnInit, OnChanges, SimpleChanges } from '@angular/core';
import { PostscriptReadinessIssue } from '../postscript-setup-alert/postscript-setup-alert.component';
import { ControllerService } from '../../services/controller.service';

export interface ExportDestinationPreview {
	key: string;
	label: string;
	template: string;
	usesDefault: boolean;
	path: string;
	fileName: string;
	unresolvedTokens: string[];
	error?: string;
	/* Precomputed by the component: rebuilding these in a template getter would hand *ngFor a new
	   array every change-detection pass and re-create the DOM under the user. Folder and file are
	   split because people scan for the FILE name — burying it at the end of one long path is what
	   made the first version hard to read. */
	folderSegments?: Array<{ text: string; unresolved: boolean }>;
	fileSegments?: Array<{ text: string; unresolved: boolean }>;
}

/** An unresolved [Token] plus the value the user types for it. */
export interface ExportTokenInput {
	token: string;
	value: string;
}

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

	/*
	 * Where each export will land, resolved by the SAME host code the export itself runs (preview mode
	 * only suppresses folder creation). Shown so an unresolved [Token] — which the resolver keeps as
	 * literal text — is caught here instead of surfacing later as a folder named "[League]".
	 */
	destinations: ExportDestinationPreview[] = [];
	destinationsLoading = false;
	destinationsError = '';
	/** One entry per distinct unresolved token across all enabled destinations; edited by the user. */
	tokenInputs: ExportTokenInput[] = [];
	private previewRequestId = 0;
	private previewDebounceTimer: any = null;

	constructor(private controller: ControllerService) {}

	ngOnInit(): void {
		this.resetCheckboxes();
	}

	ngOnChanges(changes: SimpleChanges): void {
		if (changes['isOpen'] && this.isOpen) {
			this.resetCheckboxes();
			this.prefillControlAndVersionFromDocument();
			this.refreshDestinations();
		}
	}

	private resetCheckboxes(): void {
		this.exportPrintGuide = true;
		this.exportPostscript = this.postscriptReady;
		this.controlNumber = '';
		this.versionNumber = '';
		this.destinations = [];
		this.destinationsError = '';
		this.tokenInputs = [];
		this.controller.clearExportTokenOverrides();
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

	/*
	 * Typing only updates the value. The path preview re-resolves on BLUR (or Enter), not per
	 * keystroke — a host round-trip per key redrew the destination list under the user's cursor and
	 * read as flicker. Blur alone is used rather than blur+change: change is a subset of blur on a
	 * text input, so pairing them just fired the refresh twice. Same rule as the token inputs.
	 */
	handleVersionNumberChange(event: Event): void {
		this.versionNumber = (event.target as HTMLInputElement).value;
	}

	/** Re-resolve the paths once the user has left the Control / Version field. */
	handleControlVersionCommit(): void {
		this.refreshDestinations();
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

	/** Destinations for the exports that are actually ticked — nothing else is worth previewing. */
	get visibleDestinations(): ExportDestinationPreview[] {
		return this.destinations.filter((d) => {
			if (d.key === 'printGuideFilePath') return this.exportPrintGuide;
			return this.postscriptReady && this.exportPostscript;
		});
	}

	/** True when an enabled destination still contains a token nobody could resolve. */
	get hasUnresolvedTokens(): boolean {
		return this.tokenInputs.length > 0;
	}

	/** How many of the missing values are still blank — drives the "2 of 3 left" style hint. */
	get missingTokenCount(): number {
		return this.tokenInputs.filter((t) => (t.value || '').trim() === '').length;
	}

	/** Split a path so the template can render "[Token]" segments differently from resolved text. */
	private pathSegments(path: string): Array<{ text: string; unresolved: boolean }> {
		const out: Array<{ text: string; unresolved: boolean }> = [];
		const re = /\[[^\]]+\]/g;
		let last = 0;
		let m: RegExpExecArray | null;
		while ((m = re.exec(path)) !== null) {
			if (m.index > last) out.push({ text: path.slice(last, m.index), unresolved: false });
			out.push({ text: m[0], unresolved: true });
			last = m.index + m[0].length;
		}
		if (last < path.length) out.push({ text: path.slice(last), unresolved: false });
		return out;
	}

	handleTokenValueChange(token: string, event: Event): void {
		const value = (event.target as HTMLInputElement).value;
		const entry = this.tokenInputs.find((t) => t.token === token);
		if (entry) entry.value = value;
	}

	/** Re-resolve with what the user has typed so far. */
	applyTokenValues(): void {
		this.refreshDestinations();
	}

	/*
	 * Ask the host where each export would land. Control/Version are passed as overrides because the
	 * document's CONTROL_NUMBER / VERSION_NUMBER frames are only written at export time — without them
	 * [CONTROL] / [V#] would always preview as unresolved.
	 */
	private refreshDestinations(): void {
		if (!this.isOpen || typeof (this.controller as any)?.previewExportDestinations !== 'function') {
			return;
		}
		/* Typing fires this per keystroke and each call is a host round-trip; coalesce them. */
		if (this.previewDebounceTimer) clearTimeout(this.previewDebounceTimer);
		this.previewDebounceTimer = setTimeout(() => {
			this.previewDebounceTimer = null;
			this.runDestinationPreview();
		}, 250);
	}

	private runDestinationPreview(): void {
		const overrides = this.buildOverrides();
		this.controller.setExportTokenOverrides(overrides);

		const requestId = ++this.previewRequestId;
		this.destinationsLoading = true;
		this.destinationsError = '';

		Promise.resolve(this.controller.previewExportDestinations())
			.then((res: any) => {
				/* Typing is faster than the host round-trip; ignore anything but the newest request. */
				if (requestId !== this.previewRequestId) return;
				if (!res || res.success === false) {
					this.destinations = [];
					this.tokenInputs = [];
					this.destinationsError = (res && res.error) || 'Could not resolve the export paths.';
					return;
				}
				const items: ExportDestinationPreview[] = Array.isArray(res.items) ? res.items : [];
				items.forEach((item) => {
					const path = item.path || '';
					const cut = path.lastIndexOf('/');
					const folder = cut === -1 ? '' : path.slice(0, cut + 1);
					const file = cut === -1 ? path : path.slice(cut + 1);
					item.folderSegments = this.pathSegments(folder);
					item.fileSegments = this.pathSegments(file);
				});
				this.destinations = items;
				this.syncTokenInputs();
			})
			.catch(() => {
				if (requestId !== this.previewRequestId) return;
				this.destinations = [];
				this.tokenInputs = [];
				this.destinationsError = 'Could not resolve the export paths.';
			})
			.finally(() => {
				if (requestId === this.previewRequestId) this.destinationsLoading = false;
			});
	}

	/*
	 * One input per distinct unresolved token across the ENABLED destinations, preserving anything
	 * already typed — the list is rebuilt on every re-resolve and must not wipe the user's entry.
	 */
	private syncTokenInputs(): void {
		const previous = new Map(this.tokenInputs.map((t) => [t.token.toLowerCase(), t.value]));
		const seen = new Set<string>();
		const next: ExportTokenInput[] = [];
		for (const dest of this.visibleDestinations) {
			for (const token of dest.unresolvedTokens || []) {
				const key = token.toLowerCase();
				if (seen.has(key)) continue;
				seen.add(key);
				next.push({ token, value: previous.get(key) || '' });
			}
		}
		this.tokenInputs = next;
	}

	private buildOverrides(): { [token: string]: string } {
		const overrides: { [token: string]: string } = {};
		for (const entry of this.tokenInputs) {
			const value = (entry.value || '').trim();
			if (value !== '') overrides[entry.token] = value;
		}
		/* Same aliases getExportVariableContext sets from the document's frames. */
		const control = (this.controlNumber || '').trim();
		if (control !== '') {
			overrides['Control'] = control;
			overrides['Control Number'] = control;
		}
		const versionRaw = (this.versionNumber || '').trim();
		if (versionRaw !== '') {
			const version = /^v/i.test(versionRaw) ? versionRaw : 'V' + versionRaw;
			overrides['Version'] = version;
			overrides['Version Number'] = version;
			overrides['V#'] = version;
		}
		return overrides;
	}

	onExport(): void {
		if (!this.canExport) {
			return;
		}
		/* The export scripts read these from the service, so set them BEFORE emitting. */
		this.controller.setExportTokenOverrides(this.buildOverrides());
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
		/* Which destinations are shown changed, so the token list must follow. */
		this.syncTokenInputs();
	}

	handlePostscriptChange(event: Event): void {
		this.exportPostscript = (event.target as HTMLInputElement).checked;
		/* Which destinations are shown changed, so the token list must follow. */
		this.syncTokenInputs();
	}
}
