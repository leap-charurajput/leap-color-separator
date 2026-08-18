import { Component } from '@angular/core';
import { DataIssue, DataIssuesService } from '../../services/data-issues.service';

/*
 * Red banner at the top of the panel listing data problems (missing team JSON, unreadable LEAP
 * server path, unresolved grid swatch). Presentational only — everything it shows is reported into
 * DataIssuesService by whoever detected it.
 */
@Component({
	selector: 'app-data-issue-banner',
	templateUrl: './data-issue-banner.component.html',
	styleUrls: ['./data-issue-banner.component.css']
})
export class DataIssueBannerComponent {
	constructor(private dataIssues: DataIssuesService) {}

	get issues(): DataIssue[] {
		return this.dataIssues.issues;
	}

	trackById(_index: number, issue: DataIssue): string {
		return issue.id;
	}

	dismiss(id: string): void {
		this.dataIssues.dismiss(id);
	}
}
