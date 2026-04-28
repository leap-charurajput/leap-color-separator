import {
 Component,
 EventEmitter,
 Input,
 OnChanges,
 Output,
 SimpleChanges
} from '@angular/core';

export type SeparationProfileActionDialogMode = 'duplicate' | 'edit-new';

export interface SeparationProfileActionDialogResult {
 mode: SeparationProfileActionDialogMode;
 profileName: string;
 styleCodes: string[];
 duplicateAiFile?: boolean;
 scaleEnabled: boolean;
 scalePercent: number | null;
}

@Component({
 selector: 'app-separation-profile-action-dialog',
 templateUrl: './separation-profile-action-dialog.component.html',
 styleUrls: ['./separation-profile-action-dialog.component.css']
})
export class SeparationProfileActionDialogComponent implements OnChanges {
 @Input() isOpen = false;
 @Input() mode: SeparationProfileActionDialogMode = 'edit-new';
 /** Style codes shown as checkboxes (e.g. profile group styles or all team styles for New). */
 @Input() styleCodeOptions: string[] = [];
 @Input() initialProfileName = '';
 @Input() initialSelectedStyleCodes: string[] = [];
 /** When false, "Duplicate existing ai separation file" is disabled (no file on disk yet). */
 @Input() hasSeparationFile = false;
 @Input() initialDuplicateAiFile = true;
 @Input() initialScaleEnabled = false;
 @Input() initialScalePercent: number | null = 100;

 @Output() cancel = new EventEmitter<void>();
 @Output() confirm = new EventEmitter<SeparationProfileActionDialogResult>();

 selectedProfileName = '';
 styleChecked: Record<string, boolean> = {};
 duplicateAiFile = true;
 scaleEnabled = false;
 scalePercentStr = '100';

 ngOnChanges(changes: SimpleChanges): void {
  if (changes['isOpen'] && this.isOpen) {
   this.resetFromInputs();
  }
  if (
   this.isOpen &&
   (changes['styleCodeOptions'] ||
    changes['initialSelectedStyleCodes'] ||
    changes['initialProfileName'] ||
    changes['hasSeparationFile'] ||
    changes['mode'])
  ) {
   this.resetFromInputs();
  }
 }

 private resetFromInputs(): void {
  this.selectedProfileName = this.initialProfileName || '';
  this.duplicateAiFile = this.hasSeparationFile ? this.initialDuplicateAiFile : false;
  this.scaleEnabled = this.initialScaleEnabled;
  this.scalePercentStr =
   this.initialScalePercent != null && !isNaN(Number(this.initialScalePercent))
    ? String(Math.round(Number(this.initialScalePercent)))
    : '100';

  const next: Record<string, boolean> = {};
  const opts = this.styleCodeOptions || [];
  const initial = new Set((this.initialSelectedStyleCodes || []).map((s) => String(s)));
  for (const code of opts) {
   next[String(code)] = initial.size === 0 ? true : initial.has(String(code));
  }
  if (this.mode === 'duplicate' && opts.length > 0) {
   next[String(opts[0])] = false;
  }
  this.styleChecked = next;
 }

 /** In Duplicate mode, the first listed style cannot be moved (unchecked + disabled in UI). */
 isDuplicateLockedFirstStyle(code: string): boolean {
  if (this.mode !== 'duplicate') {
   return false;
  }
  const first = (this.styleCodeOptions || [])[0];
  return first != null && String(first) === String(code);
 }

 get dialogTitle(): string {
  return this.mode === 'duplicate' ? 'Duplicate Separation' : 'Edit/New Separation';
 }

 get stylesLabel(): string {
  return this.mode === 'duplicate' ? 'Select styles to move' : 'Styles';
 }

 get duplicateScaleDisabled(): boolean {
  return !this.duplicateAiFile || !this.hasSeparationFile;
 }

 onOverlayClick(): void {
  this.cancel.emit();
 }

 onStyleToggle(code: string, ev: Event): void {
  if (this.isDuplicateLockedFirstStyle(code)) {
   return;
  }
  const t = ev.target as HTMLInputElement;
  this.styleChecked = { ...this.styleChecked, [code]: t.checked };
 }

 onScalePercentInput(ev: Event): void {
  const v = (ev.target as HTMLInputElement).value;
  if (v === '' || /^\d*\.?\d*$/.test(v)) {
   this.scalePercentStr = v;
  }
 }

 onDuplicateAiToggle(ev: Event): void {
  const t = ev.target as HTMLInputElement;
  this.duplicateAiFile = t.checked;
  if (this.duplicateScaleDisabled) {
   this.scaleEnabled = false;
  }
 }

 onScaleEnabledToggle(ev: Event): void {
  const t = ev.target as HTMLInputElement;
  this.scaleEnabled = t.checked;
 }

 onCancel(): void {
  this.cancel.emit();
 }

 onOk(): void {
  const selectedStyles = (this.styleCodeOptions || []).filter((c) => !!this.styleChecked[String(c)]);
  if (!this.selectedProfileName || !this.selectedProfileName.trim()) {
   return;
  }
  if (selectedStyles.length === 0) {
   return;
  }

  let scalePercent: number | null = null;
  if (this.scaleEnabled) {
   const n = parseFloat(this.scalePercentStr);
   scalePercent = !isNaN(n) && n > 0 ? n : null;
  }

  this.confirm.emit({
   mode: this.mode,
   profileName: this.selectedProfileName.trim(),
   styleCodes: selectedStyles,
   duplicateAiFile: this.mode === 'duplicate' ? this.duplicateAiFile && this.hasSeparationFile : undefined,
   scaleEnabled: this.scaleEnabled,
   scalePercent
  });
 }

 get canSubmit(): boolean {
  const opts = this.styleCodeOptions || [];
  if (!this.selectedProfileName?.trim()) {
   return false;
  }
  if (this.mode === 'duplicate') {
   const movable = opts.slice(1);
   if (movable.length === 0) {
    return false;
   }
   return movable.some((c) => !!this.styleChecked[String(c)]);
  }
  return opts.some((c) => !!this.styleChecked[String(c)]);
 }
}
