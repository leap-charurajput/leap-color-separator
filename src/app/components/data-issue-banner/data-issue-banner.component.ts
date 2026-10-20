import { ChangeDetectorRef, Component, NgZone } from '@angular/core';
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
	constructor(
		private dataIssues: DataIssuesService,
		private ngZone: NgZone,
		private cdr: ChangeDetectorRef
	) {}

	get issues(): DataIssue[] {
		return this.dataIssues.issues;
	}

	trackById(_index: number, issue: DataIssue): string {
		return issue.id;
	}

	dismiss(id: string): void {
		this.dataIssues.dismiss(id);
	}

	/** Ids whose action button is running (button disabled meanwhile, so it cannot be clicked twice). */
	busy = new Set<string>();

	async runAction(issue: DataIssue): Promise<void> {
		if (!issue.action || this.busy.has(issue.id)) return;
		this.busy.add(issue.id);
		try {
			await issue.action.run();
		} finally {
			/* The host call resolves outside Angular's zone; refresh so the button / cleared entry update. */
			this.ngZone.run(() => {
				this.busy.delete(issue.id);
				this.cdr.detectChanges();
			});
		}
	}
}
