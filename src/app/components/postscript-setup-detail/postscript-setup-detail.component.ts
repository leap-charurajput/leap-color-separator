import { Component, EventEmitter, Input, Output } from '@angular/core';
import { PostscriptReadinessIssue } from '../postscript-setup-alert/postscript-setup-alert.component';

@Component({
 selector: 'app-postscript-setup-detail',
 templateUrl: './postscript-setup-detail.component.html',
 styleUrls: ['./postscript-setup-detail.component.css']
})
export class PostscriptSetupDetailComponent {
 @Input() issues: PostscriptReadinessIssue[] = [];
 @Output() close = new EventEmitter<void>();

 onClose(): void {
  this.close.emit();
 }
}
