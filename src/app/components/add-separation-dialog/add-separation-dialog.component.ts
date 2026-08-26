import { ChangeDetectorRef, Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';

export interface AddSeparationDialogStyleOption {
	styleCode: string;
	profileName: string;
	styleDesc?: string;
}

export interface AddSeparationDialogResult {
	mode: 'style' | 'profile';
	profileName: string;
	styleCodes: string[];
	/* Where the manual style->profile decision should live: just this document, or the whole teamout. */
	scope: 'file' | 'teamout';
}

@Component({
	selector: 'app-add-separation-dialog',
	templateUrl: './add-separation-dialog.component.html',
	styleUrls: ['./add-separation-dialog.component.css']
})
export class AddSeparationDialogComponent implements OnChanges {
	@Input() isOpen = false;
	@Input() graphicName = '';
	@Input() isLoading = false;
	@Input() styleOptions: AddSeparationDialogStyleOption[] = [];
	/*
	 * The styles this manual add is FOR — the graphic's style codes that came up "Unknown Profile".
	 * Profile mode attaches exactly these (user decision), never the profile's whole catalog: picking
	 * "Fanatics-Plastisol" used to attach every style mapped to it in Styles.xlsx (hundreds).
	 */
	@Input() targetStyleCodes: string[] = [];

	@Output() cancel = new EventEmitter<void>();
	@Output() confirm = new EventEmitter<AddSeparationDialogResult>();

	selectionMode: 'style' | 'profile' = 'style';
	scope: 'file' | 'teamout' = 'file';
	query = '';
	selectedStyleCode = '';
	selectedProfileName = '';
	filteredStyles: AddSeparationDialogStyleOption[] = [];
	filteredProfiles: string[] = [];
	showStyleList = false;
	showProfileList = false;

	constructor(private cdr: ChangeDetectorRef) {}

	ngOnChanges(changes: SimpleChanges): void {
		if (changes['isOpen'] && this.isOpen) {
			this.resetState();
		}
		if (changes['styleOptions'] || changes['isOpen']) {
			this.updateFilteredResults();
		}
	}

	private resetState(): void {
		this.selectionMode = 'style';
		this.scope = 'file';
		this.query = '';
		this.selectedStyleCode = '';
		this.selectedProfileName = '';
		this.filteredStyles = [];
		this.filteredProfiles = [];
		this.showStyleList = false;
		this.showProfileList = false;
	}

	get normalizedQuery(): string {
		return (this.query || '').trim().toLowerCase();
	}

	get hasTypedQuery(): boolean {
		return this.normalizedQuery.length > 0;
	}

	get uniqueProfiles(): string[] {
		const set = new Set<string>();
		(this.styleOptions || []).forEach((item) => {
			const profileName = String(item?.profileName || '').trim();
			if (profileName) set.add(profileName);
		});
		return Array.from(set).sort((a, b) => a.localeCompare(b));
	}

	private updateFilteredResults(): void {
		if (!this.hasTypedQuery) {
			this.filteredStyles = (this.styleOptions || []).slice();
			this.filteredProfiles = this.uniqueProfiles.slice(0, 100);
			console.log('[AddSeparationDialog] Cleared filtered lists (empty query)', {
				selectionMode: this.selectionMode,
				query: this.query,
				styleOptionsCount: (this.styleOptions || []).length
			});
			return;
		}

		this.filteredStyles = (this.styleOptions || [])
			.filter((item) => {
				const styleCode = String(item?.styleCode || '').trim().toLowerCase();
				const styleDesc = String(item?.styleDesc || '').trim().toLowerCase();
				return styleCode.includes(this.normalizedQuery) || styleDesc.includes(this.normalizedQuery);
			})
			.slice(0, 100);

		this.filteredProfiles = this.uniqueProfiles
			.filter((profileName) => profileName.toLowerCase().includes(this.normalizedQuery))
			.slice(0, 100);

		console.log('[AddSeparationDialog] Filtered results updated', {
			selectionMode: this.selectionMode,
			query: this.query,
			normalizedQuery: this.normalizedQuery,
			styleOptionsCount: (this.styleOptions || []).length,
			uniqueProfilesCount: this.uniqueProfiles.length,
			filteredStylesCount: this.filteredStyles.length,
			filteredProfilesCount: this.filteredProfiles.length,
			styleSample: (this.styleOptions || []).slice(0, 10).map((item) => String(item?.styleCode || '').trim()),
			filteredStyleSample: this.filteredStyles.slice(0, 10).map((item) => String(item?.styleCode || '').trim())
		});
	}

	get selectedProfileFromStyle(): string {
		const selected = (this.styleOptions || []).find(
			(item) => String(item?.styleCode || '').trim() === String(this.selectedStyleCode || '').trim()
		);
		return selected?.profileName || '';
	}

	get selectedProfileDisplay(): string {
		return this.selectedProfileName;
	}

	get canSubmit(): boolean {
		if (this.isLoading) return false;
		if (this.selectionMode === 'style') return !!this.selectedStyleCode;
		/* Profile mode needs both a profile AND the styles this add is for. */
		return !!this.selectedProfileName && this.targetStyleCodesClean.length > 0;
	}

	/** The styles a profile-mode add will attach — shown in the dialog so the user sees exactly what they are mapping. */
	get targetStyleCodesClean(): string[] {
		return Array.from(
			new Set((this.targetStyleCodes || []).map((s) => String(s || '').trim()).filter(Boolean))
		);
	}

	onModeChange(mode: 'style' | 'profile'): void {
		this.selectionMode = mode;
		this.query = '';
		this.updateFilteredResults();
	}

	onStyleInput(ev: Event): void {
		if (this.selectionMode !== 'style') return;
		const value = (ev.target as HTMLInputElement | null)?.value || '';
		this.query = value;
		this.showStyleList = true;
		if (this.selectedStyleCode) this.selectedStyleCode = '';
		console.log('[AddSeparationDialog] onStyleInput', {
			rawInput: value,
			normalizedQuery: (value || '').trim().toLowerCase(),
			styleOptionsCount: (this.styleOptions || []).length
		});
		this.updateFilteredResults();
		this.cdr.detectChanges();
	}

	onProfileInput(ev: Event): void {
		if (this.selectionMode !== 'profile') return;
		const value = (ev.target as HTMLInputElement | null)?.value || '';
		this.query = value;
		this.showProfileList = true;
		if (this.selectedProfileName) this.selectedProfileName = '';
		this.updateFilteredResults();
		this.cdr.detectChanges();
	}

	selectStyle(styleCode: string): void {
		this.selectedStyleCode = String(styleCode || '').trim();
		this.selectedProfileName = '';
		this.query = '';
		this.showStyleList = false;
		this.updateFilteredResults();
		this.cdr.detectChanges();
	}

	selectProfile(profileName: string): void {
		this.selectedProfileName = String(profileName || '').trim();
		this.selectedStyleCode = '';
		this.query = '';
		this.showProfileList = false;
		this.updateFilteredResults();
		this.cdr.detectChanges();
	}

	onStyleOptionMouseDown(styleCode: string, ev: MouseEvent): void {
		ev.preventDefault();
		ev.stopPropagation();
		this.selectStyle(styleCode);
	}

	onStyleFocus(): void {
		if (this.selectionMode !== 'style') {
			this.selectionMode = 'style';
			this.query = '';
		}
		this.showStyleList = true;
		this.updateFilteredResults();
		this.cdr.detectChanges();
	}

	onStyleBlur(): void {
		// Delay to allow option mousedown to commit before hiding.
		setTimeout(() => {
			this.showStyleList = false;
			this.cdr.detectChanges();
		}, 0);
	}

	onProfileFocus(): void {
		if (this.selectionMode !== 'profile') {
			this.selectionMode = 'profile';
			this.query = '';
		}
		this.showProfileList = true;
		this.updateFilteredResults();
		this.cdr.detectChanges();
	}

	onProfileBlur(): void {
		setTimeout(() => {
			this.showProfileList = false;
			this.cdr.detectChanges();
		}, 0);
	}

	onProfileOptionMouseDown(profileName: string, ev: MouseEvent): void {
		ev.preventDefault();
		ev.stopPropagation();
		this.selectProfile(profileName);
	}

	cancelDialog(): void {
		this.cancel.emit();
	}

	confirmDialog(): void {
		console.log('[AddSeparationDialog] confirmDialog clicked', {
			selectionMode: this.selectionMode,
			canSubmit: this.canSubmit,
			selectedStyleCode: this.selectedStyleCode,
			selectedProfileName: this.selectedProfileName,
			query: this.query
		});
		if (!this.canSubmit) return;
		if (this.selectionMode === 'style') {
			const styleCode = String(this.selectedStyleCode || '').trim();
			if (!styleCode) return;
			console.log('[AddSeparationDialog] Emitting style confirm payload', {
				mode: 'style',
				profileName: this.selectedProfileFromStyle || 'Unknown Profile',
				styleCodes: [styleCode]
			});
			this.confirm.emit({
				mode: 'style',
				profileName: this.selectedProfileFromStyle || 'Unknown Profile',
				styleCodes: [styleCode],
				scope: this.scope
			});
			return;
		}

		const profileName = String(this.selectedProfileName || '').trim();
		if (!profileName) return;
		/*
		 * Profile mode attaches ONLY the styles this add is for (the graphic's missing-profile codes,
		 * passed in as targetStyleCodes) — never every style mapped to the profile in Styles.xlsx.
		 */
		const deduped = Array.from(
			new Set((this.targetStyleCodes || []).map((s) => String(s || '').trim()).filter(Boolean))
		);
		if (deduped.length === 0) return;
		console.log('[AddSeparationDialog] Emitting profile confirm payload', {
			mode: 'profile',
			profileName,
			styleCodes: deduped,
			scope: this.scope
		});
		this.confirm.emit({
			mode: 'profile',
			profileName,
			styleCodes: deduped,
			scope: this.scope
		});
	}
}

