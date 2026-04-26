import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';

export interface AddSeparationDialogStyleOption {
 styleCode: string;
 profileName: string;
}

export interface AddSeparationDialogResult {
 mode: 'style' | 'profile';
 profileName: string;
 styleCodes: string[];
}

@Component({
 selector: 'app-add-separation-dialog',
 templateUrl: './add-separation-dialog.component.html',
 styleUrls: ['./add-separation-dialog.component.css']
})
export class AddSeparationDialogComponent implements OnChanges {
 @Input() isOpen = false;
 @Input() graphicName = '';
 @Input() isLoading = false;
 @Input() styleOptions: AddSeparationDialogStyleOption[] = [];

 @Output() cancel = new EventEmitter<void>();
 @Output() confirm = new EventEmitter<AddSeparationDialogResult>();

 selectionMode: 'style' | 'profile' = 'style';
 query = '';
 selectedStyleCode = '';
 selectedProfileName = '';

 ngOnChanges(changes: SimpleChanges): void {
  if (changes['isOpen'] && this.isOpen) {
   this.resetState();
  }
 }

 private resetState(): void {
  this.selectionMode = 'style';
  this.query = '';
  this.selectedStyleCode = '';
  this.selectedProfileName = '';
 }

 get normalizedQuery(): string {
  return (this.query || '').trim().toLowerCase();
 }

 get hasTypedQuery(): boolean {
  return this.normalizedQuery.length > 0;
 }

 get uniqueProfiles(): string[] {
  const set = new Set<string>();
  (this.styleOptions || []).forEach((item) => {
   const profileName = String(item?.profileName || '').trim();
   if (profileName) set.add(profileName);
  });
  return Array.from(set).sort((a, b) => a.localeCompare(b));
 }

 get filteredStyles(): AddSeparationDialogStyleOption[] {
  if (!this.hasTypedQuery) return [];
  return (this.styleOptions || [])
   .filter((item) => String(item?.styleCode || '').trim().toLowerCase().includes(this.normalizedQuery))
   .slice(0, 100);
 }

 get filteredProfiles(): string[] {
  if (!this.hasTypedQuery) return [];
  return this.uniqueProfiles
   .filter((profileName) => profileName.toLowerCase().includes(this.normalizedQuery))
   .slice(0, 100);
 }

 get selectedProfileFromStyle(): string {
  const selected = (this.styleOptions || []).find(
   (item) => String(item?.styleCode || '').trim() === String(this.selectedStyleCode || '').trim()
  );
  return selected?.profileName || '';
 }

 get selectedProfileDisplay(): string {
  return this.selectionMode === 'style' ? this.selectedProfileFromStyle : this.selectedProfileName;
 }

 get canSubmit(): boolean {
  if (this.isLoading) return false;
  if (this.selectionMode === 'style') return !!this.selectedStyleCode;
  return !!this.selectedProfileName;
 }

 onModeChange(mode: 'style' | 'profile'): void {
  this.selectionMode = mode;
  this.query = '';
 }

 onStyleInput(ev: Event): void {
  if (this.selectionMode !== 'style') return;
  const value = (ev.target as HTMLInputElement).value;
  this.query = value;
  if (this.selectedStyleCode) this.selectedStyleCode = '';
 }

 onProfileInput(ev: Event): void {
  if (this.selectionMode !== 'profile') return;
  const value = (ev.target as HTMLInputElement).value;
  this.query = value;
  if (this.selectedProfileName) this.selectedProfileName = '';
 }

 selectStyle(styleCode: string): void {
  this.selectedStyleCode = String(styleCode || '').trim();
  this.selectedProfileName = '';
  this.query = '';
 }

 selectProfile(profileName: string): void {
  this.selectedProfileName = String(profileName || '').trim();
  this.selectedStyleCode = '';
  this.query = '';
 }

 cancelDialog(): void {
  this.cancel.emit();
 }

 confirmDialog(): void {
  if (!this.canSubmit) return;
  if (this.selectionMode === 'style') {
   const styleCode = String(this.selectedStyleCode || '').trim();
   if (!styleCode) return;
   this.confirm.emit({
    mode: 'style',
    profileName: this.selectedProfileFromStyle || 'Unknown Profile',
    styleCodes: [styleCode]
   });
   return;
  }

  const profileName = String(this.selectedProfileName || '').trim();
  if (!profileName) return;
  const styleCodes = (this.styleOptions || [])
   .filter((item) => String(item?.profileName || '').trim() === profileName)
   .map((item) => String(item?.styleCode || '').trim())
   .filter(Boolean);
  const deduped = Array.from(new Set(styleCodes)).sort();
  if (deduped.length === 0) return;
  this.confirm.emit({
   mode: 'profile',
   profileName,
   styleCodes: deduped
  });
 }
}

