import { ChangeDetectorRef, Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';

export interface AddSeparationDialogStyleOption {
	styleCode: string;
	profileName: string;
}

export interface AddSeparationDialogResult {
	mode: 'style' | 'profile';
	profileName: string;
	styleCodes: string[];
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

	@Output() cancel = new EventEmitter<void>();
	@Output() confirm = new EventEmitter<AddSeparationDialogResult>();

	selectionMode: 'style' | 'profile' = 'style';
	query = '';
	selectedStyleCode = '';
	selectedProfileName = '';
	filteredStyles: AddSeparationDialogStyleOption[] = [];
	filteredProfiles: string[] = [];

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
		this.query = '';
		this.selectedStyleCode = '';
		this.selectedProfileName = '';
		this.filteredStyles = [];
		this.filteredProfiles = [];
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
			this.filteredStyles = [];
			this.filteredProfiles = [];
			console.log('[AddSeparationDialog] Cleared filtered lists (empty query)', {
				selectionMode: this.selectionMode,
				query: this.query,
				styleOptionsCount: (this.styleOptions || []).length
			});
			return;
		}

		this.filteredStyles = (this.styleOptions || [])
			.filter((item) => String(item?.styleCode || '').trim().toLowerCase().includes(this.normalizedQuery))
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
		return !!this.selectedProfileName;
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
		if (this.selectedProfileName) this.selectedProfileName = '';
		this.updateFilteredResults();
		this.cdr.detectChanges();
	}

	selectStyle(styleCode: string): void {
		this.selectedStyleCode = String(styleCode || '').trim();
		this.selectedProfileName = '';
		this.query = '';
		this.updateFilteredResults();
		this.cdr.detectChanges();
	}

	selectProfile(profileName: string): void {
		this.selectedProfileName = String(profileName || '').trim();
		this.selectedStyleCode = '';
		this.query = '';
		this.updateFilteredResults();
		this.cdr.detectChanges();
	}

	onStyleOptionMouseDown(styleCode: string, ev: MouseEvent): void {
		ev.preventDefault();
		ev.stopPropagation();
		this.selectStyle(styleCode);
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
				styleCodes: [styleCode]
			});
			return;
		}

		const profileName = String(this.selectedProfileName || '').trim();
		if (!profileName) return;
		const styleCodes = (this.styleOptions || [])
			.filter((item) => String(item?.profileName || '').trim() === profileName)
			.map((item) => String(item?.styleCode || '').trim())
			.filter(Boolean);
		const deduped = Array.from(new Set(styleCodes)).sort();
		if (deduped.length === 0) return;
		console.log('[AddSeparationDialog] Emitting profile confirm payload', {
			mode: 'profile',
			profileName,
			styleCodes: deduped
		});
		this.confirm.emit({
			mode: 'profile',
			profileName,
			styleCodes: deduped
		});
	}
}

