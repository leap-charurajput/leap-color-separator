import { Component, Input, Output, EventEmitter, OnInit, OnChanges, SimpleChanges } from '@angular/core';

interface ProfileFormState {
	id: string;
	name: string;
	code: string;
	colorMesh: string;
	underbaseMeshes: string[];
	waterbaseInk: boolean;
}

const defaultProfile: ProfileFormState = {
	id: '',
	name: '',
	code: '',
	colorMesh: '',
	underbaseMeshes: ['', '', '', ''],
	waterbaseInk: false
};

@Component({
	selector: 'app-edit-separation-profile-modal',
	templateUrl: './edit-separation-profile-modal.component.html',
	styleUrls: ['./edit-separation-profile-modal.component.css']
})
export class EditSeparationProfileModalComponent implements OnInit, OnChanges {
	@Input() isOpen = false;
	@Input() profile: any = null;
	@Output() close = new EventEmitter<void>();
	@Output() save = new EventEmitter<any>();

	formState: ProfileFormState = { ...defaultProfile };

	ngOnInit(): void {
		this.updateFormState();
	}

	ngOnChanges(changes: SimpleChanges): void {
		if (changes['profile'] || changes['isOpen']) {
			this.updateFormState();
		}
	}

	private updateFormState(): void {
		if (this.profile) {
			this.formState = {
				...defaultProfile,
				...this.profile,
				underbaseMeshes: [...(this.profile.underbaseMeshes || defaultProfile.underbaseMeshes)]
			};
		} else {
			this.formState = { ...defaultProfile };
		}
	}

	onOverlayInteraction(event: MouseEvent): void {
		event.stopPropagation();
	}

	onInputChange(field: string, event: Event): void {
		const value = (event.target as HTMLInputElement).value;
		(this.formState as any)[field] = value;
	}

	onMeshChange(index: number, event: Event): void {
		const value = (event.target as HTMLInputElement).value;
		this.formState.underbaseMeshes = [...this.formState.underbaseMeshes];
		this.formState.underbaseMeshes[index] = value;
	}

	onCheckboxChange(event: Event): void {
		this.formState.waterbaseInk = (event.target as HTMLInputElement).checked;
	}

	onSubmit(event: Event): void {
		event.preventDefault();
		this.save.emit({
			...this.formState,
			underbaseMeshes: [...this.formState.underbaseMeshes]
		});
	}

	onCancel(): void {
		this.close.emit();
	}
}
