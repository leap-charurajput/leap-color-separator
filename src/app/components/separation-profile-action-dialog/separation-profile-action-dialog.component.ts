import {
 Component,
 EventEmitter,
 Input,
 OnChanges,
 Output,
 SimpleChanges
} from '@angular/core';

export type SeparationProfileActionDialogMode = 'duplicate' | 'edit-new' | 'duplicate-file';

export interface SeparationProfileActionDialogResult {
 mode: SeparationProfileActionDialogMode;
 profileName: string;
 styleCodes: string[];
 duplicateAiFile?: boolean;
 scaleEnabled: boolean;
 scalePercent: number | null;
 /* 'duplicate-file' only: the style the copy is for, and the copy's file name. */
 styleNumber?: string;
 fileName?: string;
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
 /* 'duplicate-file' only: the existing SEP file name, and the style(s) it was made for. */
 @Input() existingFileName = '';
 @Input() existingStyleCodes: string[] = [];

 @Output() cancel = new EventEmitter<void>();
 @Output() confirm = new EventEmitter<SeparationProfileActionDialogResult>();

 selectedProfileName = '';
 styleChecked: Record<string, boolean> = {};
 duplicateAiFile = true;
 scaleEnabled = false;
 scalePercentStr = '100';
 styleNumber = '';
 fileName = '';
 /* Once the user edits the file name, typing a style no longer rewrites it. */
 private fileNameTouched = false;
 /*
  * Graphic scale is a percent OF THE ORIGINAL SIZE: 100 = unchanged, 120 = 20% larger, 80 = 20%
  * smaller (same as Illustrator's Object > Transform > Scale). The label used to read "Scale graphic
  * BY", which made 20 look like the way to ask for +20% (2026-10-02). The bounds only catch typos —
  * 1000 for 100, 2 for 120 — not a design limit.
  */
 readonly minScalePercent = 10;
 readonly maxScalePercent = 400;

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
    changes['existingFileName'] ||
    changes['mode'])
  ) {
   this.resetFromInputs();
  }
  /*
   * The saved scale arrives a moment AFTER the dialog opens (it is read from the document), so it
   * gets its own path: update only the scale fields, and only while the user has not touched them —
   * a full reset here would also wipe any style boxes they already ticked.
   */
  if (
   this.isOpen &&
   !changes['isOpen'] &&
   !this.scaleTouched &&
   (changes['initialScaleEnabled'] || changes['initialScalePercent'])
  ) {
   this.applyInitialScale();
  }
 }

 /** True once the user changes the scale checkbox or value — late inputs must not overwrite that. */
 private scaleTouched = false;

 private applyInitialScale(): void {
  this.scaleEnabled = this.initialScaleEnabled;
  this.scalePercentStr =
   this.initialScalePercent != null && !isNaN(Number(this.initialScalePercent))
    ? String(Math.round(Number(this.initialScalePercent) * 10) / 10)
    : '100';
 }

 private resetFromInputs(): void {
  this.selectedProfileName = this.initialProfileName || '';
  this.duplicateAiFile = this.hasSeparationFile ? this.initialDuplicateAiFile : false;
  this.scaleTouched = false;
  this.applyInitialScale();
  this.styleNumber = '';
  this.fileName = this.existingFileName || '';
  this.fileNameTouched = false;
  if (this.mode === 'duplicate-file') {
   /* The copy starts at the file's own size; ticking Scale resizes it from there. */
   this.scaleEnabled = false;
   this.scalePercentStr = '100';
  }

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
  if (this.mode === 'duplicate-file') return 'Duplicate Separation';
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
  this.scaleTouched = true;
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

 /** Why the scale value cannot be used, or '' when it is fine. Edit/New only — Duplicate is unchanged. */
 get scaleError(): string {
  if (this.mode === 'duplicate' || !this.scaleEnabled) {
   return '';
  }
  const n = parseFloat(this.scalePercentStr);
  if (isNaN(n)) {
   return 'Enter a size, e.g. 120 for 20% larger.';
  }
  if (n < this.minScalePercent || n > this.maxScalePercent) {
   return 'Use ' + this.minScalePercent + '–' + this.maxScalePercent + '%. 100% is the original size.';
  }
  return '';
 }

 /** Plain-language reading of the value, so 120 vs 20 is never a guess. */
 get scaleHint(): string {
  const n = parseFloat(this.scalePercentStr);
  if (!this.scaleEnabled || isNaN(n) || this.scaleError) {
   return '100% = original size';
  }
  if (n === 100) {
   return 'Original size';
  }
  const diff = Math.round(Math.abs(n - 100) * 10) / 10;
  return diff + '% ' + (n > 100 ? 'larger' : 'smaller') + ' than the original';
 }

 onScaleEnabledToggle(ev: Event): void {
  this.scaleTouched = true;
  const t = ev.target as HTMLInputElement;
  this.scaleEnabled = t.checked;
 }

 onStyleNumberInput(ev: Event): void {
  this.styleNumber = (ev.target as HTMLInputElement).value;
  if (!this.fileNameTouched) {
   this.fileName = this.buildFileName(this.styleNumber.trim());
  }
 }

 onFileNameInput(ev: Event): void {
  this.fileNameTouched = true;
  this.fileName = (ev.target as HTMLInputElement).value;
 }

 /*
  * The existing file name with its style code swapped for the new one, e.g. 7G_FM01_Front.ai + FM13 ->
  * 7G_FM13_Front.ai. A name without the old style gets the new one added before ".ai".
  */
 private buildFileName(newStyle: string): string {
  const existing = String(this.existingFileName || '');
  if (!newStyle || !existing) return existing;
  const safeStyle = newStyle.replace(/[^A-Za-z0-9._-]+/g, '_');
  for (const old of this.existingStyleCodes || []) {
   const code = String(old || '').trim();
   if (!code) continue;
   const escaped = code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
   const re = new RegExp('(^|[^A-Za-z0-9])' + escaped + '(?=[^A-Za-z0-9]|$)', 'i');
   if (re.test(existing)) {
    return existing.replace(re, (_m: string, lead: string) => lead + safeStyle);
   }
  }
  return existing.replace(/(\.ai)?$/i, '_' + safeStyle + '.ai');
 }

 /* Why the style / file name cannot be used, or '' when they are fine ('duplicate-file' only). */
 get duplicateFileError(): string {
  if (this.mode !== 'duplicate-file') return '';
  const style = this.styleNumber.trim();
  if (!style) return 'Enter the style number.';
  if ((this.existingStyleCodes || []).some((c) => String(c || '').trim().toLowerCase() === style.toLowerCase())) {
   return 'This separation file is already for ' + style + '. Enter another style.';
  }
  const name = this.fileName.trim();
  if (!name || /^\.ai$/i.test(name)) return 'Enter the file name.';
  if (/[\/\\:]/.test(name)) return 'The file name cannot contain / \\ or :';
  if (name.replace(/\.ai$/i, '').toLowerCase() === String(this.existingFileName || '').replace(/\.ai$/i, '').toLowerCase()) {
   return 'Use a different file name than the original.';
  }
  return '';
 }

 onCancel(): void {
  this.cancel.emit();
 }

 onOk(): void {
  const selectedStyles = (this.styleCodeOptions || []).filter((c) => !!this.styleChecked[String(c)]);
  if (this.mode === 'duplicate-file') {
   if (!this.canSubmit) return;
   let pct: number | null = null;
   if (this.scaleEnabled) {
    const n = parseFloat(this.scalePercentStr);
    pct = !isNaN(n) && n > 0 && n !== 100 ? n : null;
   }
   this.confirm.emit({
    mode: this.mode,
    profileName: this.selectedProfileName.trim(),
    styleCodes: [this.styleNumber.trim()],
    scaleEnabled: pct != null,
    scalePercent: pct,
    styleNumber: this.styleNumber.trim(),
    fileName: this.fileName.trim()
   });
   return;
  }
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
  if (this.scaleError) {
   return false;
  }
  if (this.mode === 'duplicate-file') {
   return !this.duplicateFileError;
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
