import { Component, Input, Output, EventEmitter } from '@angular/core';

@Component({
	selector: 'app-separation-profiles-panel',
	templateUrl: './separation-profiles-panel.component.html',
	styleUrls: ['./separation-profiles-panel.component.css']
})
export class SeparationProfilesPanelComponent {
	@Input() title = 'Separation Profiles';
	@Input() description = 'Template presets for separation runs';
	@Input() profiles: any[] = [];
	@Output() addProfile = new EventEmitter<void>();
	@Output() editProfile = new EventEmitter<any>();
	@Output() duplicateProfile = new EventEmitter<any>();
	@Output() deleteProfile = new EventEmitter<any>();

	onAddClick(): void {
		this.addProfile.emit();
	}
}
