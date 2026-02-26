import { Component, EventEmitter, Input, Output } from '@angular/core';

/**
 * Reusable confirmation dialog matching the app modal pattern.
 * Use for "Remove Separation Data", "Delete All Plates", etc.
 */
@Component({
 selector: 'app-confirm-dialog',
 templateUrl: './confirm-dialog.component.html',
 styleUrls: ['./confirm-dialog.component.css']
})
export class ConfirmDialogComponent {
 @Input() isOpen = false;
 @Input() title = 'Confirm';
 @Input() message = '';
 @Input() confirmText = 'Confirm';
 @Input() cancelText = 'Cancel';
 /** Confirm button variant: 'danger' | 'primary' | 'secondary' */
 @Input() confirmVariant: 'primary' | 'secondary' | 'danger' | 'success' = 'danger';
 /** Optional error message shown below the main message (e.g. after a failed confirm) */
 @Input() errorMessage: string | null = null;

 @Output() confirm = new EventEmitter<void>();
 @Output() cancel = new EventEmitter<void>();

 onOverlayClick(): void {
  this.cancel.emit();
 }

 onConfirm(): void {
  this.confirm.emit();
 }

 onCancel(): void {
  this.cancel.emit();
 }
}
