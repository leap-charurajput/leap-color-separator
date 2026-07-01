import {
 Component,
 EventEmitter,
 Input,
 OnChanges,
 Output,
 SimpleChanges
} from '@angular/core';

export interface ConfirmDialogCheckboxOption {
 id: string;
 label: string;
 /** Initial state when the dialog opens. Defaults to false (unchecked). */
 checked?: boolean;
}

/**
 * Reusable confirmation dialog matching the app modal pattern.
 * Use for "Remove Separation Data", "Delete All Plates", etc.
 * Optional `checkboxOptions`: when set, body shows checkboxes (unchecked by default);
 * on confirm, `confirm` emits a `Record<string, boolean>` keyed by option `id`.
 */
@Component({
 selector: 'app-confirm-dialog',
 templateUrl: './confirm-dialog.component.html',
 styleUrls: ['./confirm-dialog.component.css']
})
export class ConfirmDialogComponent implements OnChanges {
 @Input() isOpen = false;
 @Input() title = 'Confirm';
 @Input() message = '';
 @Input() confirmText = 'Confirm';
 @Input() cancelText = 'Cancel';
 /** Confirm button variant: 'danger' | 'primary' | 'secondary' */
 @Input() confirmVariant: 'primary' | 'secondary' | 'danger' | 'success' = 'danger';
 /** Optional error message shown below the main message (e.g. after a failed confirm) */
 @Input() errorMessage: string | null = null;
 /** When non-empty, shows themed checkboxes; confirm emits `{ [id]: boolean }`. */
 @Input() checkboxOptions: ConfirmDialogCheckboxOption[] | null = null;

 @Output() confirm = new EventEmitter<void | Record<string, boolean>>();
 @Output() cancel = new EventEmitter<void>();

 /** Checkbox selection when `checkboxOptions` is used */
 checkboxState: Record<string, boolean> = {};

 ngOnChanges(changes: SimpleChanges): void {
  if (changes['isOpen'] && this.isOpen && this.checkboxOptions && this.checkboxOptions.length > 0) {
   this.resetCheckboxState();
  }
 }

 private resetCheckboxState(): void {
  this.checkboxState = {};
  for (const o of this.checkboxOptions || []) {
   this.checkboxState[o.id] = o.checked === true;
  }
 }

 onDialogCheckboxChange(id: string, ev: Event): void {
  const t = ev.target as HTMLInputElement;
  if (t && t.type === 'checkbox') {
   this.checkboxState[id] = t.checked;
  }
 }

 onOverlayClick(): void {
  this.cancel.emit();
 }

 onConfirm(): void {
  if (this.checkboxOptions && this.checkboxOptions.length > 0) {
   const payload: Record<string, boolean> = {};
   for (const o of this.checkboxOptions) {
    payload[o.id] = !!this.checkboxState[o.id];
   }
   this.confirm.emit(payload);
   return;
  }
  this.confirm.emit();
 }

 onCancel(): void {
  this.cancel.emit();
 }
}
