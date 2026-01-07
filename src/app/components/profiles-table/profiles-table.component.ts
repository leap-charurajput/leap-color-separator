import { Component, Input, Output, EventEmitter } from '@angular/core';

@Component({
	selector: 'app-profiles-table',
	templateUrl: './profiles-table.component.html',
	styleUrls: ['./profiles-table.component.css']
})
export class ProfilesTableComponent {
	@Input() profiles: any[] = [];
	@Output() editProfile = new EventEmitter<any>();
	@Output() duplicateProfile = new EventEmitter<any>();
	@Output() deleteProfile = new EventEmitter<any>();

	onRowAction(action: string, profile: any): void {
		if (action === 'edit') {
			this.editProfile.emit(profile);
		} else if (action === 'duplicate') {
			this.duplicateProfile.emit(profile);
		} else if (action === 'delete') {
			this.deleteProfile.emit(profile);
		}
	}

	getUniqueKey(profile: any): string {
		const name = profile.name || '';
		const distress = profile.distress || (profile._jsonData && profile._jsonData.Distress) || 'N';
		return `${name}-${distress}`;
	}

	isDistressed(profile: any): boolean {
		const distress = profile.distress || (profile._jsonData && profile._jsonData.Distress) || 'N';
		return distress === 'Y' || distress === 'y';
	}
}
