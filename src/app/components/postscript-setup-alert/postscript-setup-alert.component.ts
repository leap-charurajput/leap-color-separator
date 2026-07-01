import { Component, EventEmitter, Input, Output } from '@angular/core';

export interface PostscriptReadinessIssue {
 id: string;
 message: string;
}

@Component({
 selector: 'app-postscript-setup-alert',
 templateUrl: './postscript-setup-alert.component.html',
 styleUrls: ['./postscript-setup-alert.component.css']
})
export class PostscriptSetupAlertComponent {
 @Input() issues: PostscriptReadinessIssue[] = [];
 @Input() detailOpen = false;
 @Output() detailOpenChange = new EventEmitter<boolean>();

 toggleDetail(event: Event): void {
  event.stopPropagation();
  this.detailOpenChange.emit(!this.detailOpen);
 }
}
