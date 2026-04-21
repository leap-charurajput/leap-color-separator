import { Component, Input, Output, EventEmitter, OnInit, OnChanges, SimpleChanges } from '@angular/core';

interface ProfileFormState {
 id: string;
 name: string;
 code: string;
 colorMesh: string;
 waterbaseInk: boolean;
 overprintAllInks: boolean;
 blocker: boolean;
 blockerMesh: string;
 underbaseEnabled: boolean[];
 underbaseMeshes: string[];
 underbaseKnockoutBlack: boolean[];
 formatInkNameLabel: boolean;
 colorNameLabelFormat: string;
 blackInksKnockoutDisplay: string;
}

const buildDefaultProfile = (defaultBlackColorNames?: string): ProfileFormState => ({
 id: '',
 name: '',
 code: '',
 colorMesh: '',
 waterbaseInk: false,
 overprintAllInks: true,
 blocker: false,
 blockerMesh: '',
 underbaseEnabled: [true, false, false, false],
 underbaseMeshes: ['110', '122', '', ''],
 underbaseKnockoutBlack: [false, false, false, false],
 formatInkNameLabel: false,
 colorNameLabelFormat: '',
 blackInksKnockoutDisplay: defaultBlackColorNames || 'Black, PANTONE Black C, PANTONE Black 6 C, BLACK 00A'
});

@Component({
 selector: 'app-edit-separation-profile-modal',
 templateUrl: './edit-separation-profile-modal.component.html',
 styleUrls: ['./edit-separation-profile-modal.component.css']
})
export class EditSeparationProfileModalComponent implements OnInit, OnChanges {
 @Input() isOpen = false;
 @Input() profile: any = null;
 @Input() defaultBlackColorNames = '';
 @Output() close = new EventEmitter<void>();
 @Output() save = new EventEmitter<any>();

 formState: ProfileFormState = buildDefaultProfile();

 ngOnInit(): void {
  this.updateFormState();
 }

 ngOnChanges(changes: SimpleChanges): void {
  if (changes['profile'] || changes['isOpen'] || changes['defaultBlackColorNames']) {
   this.updateFormState();
  }
 }

 private updateFormState(): void {
  const defaultProfile = buildDefaultProfile(this.defaultBlackColorNames);
  if (this.profile) {
   const ub = this.profile.underbaseMeshes || defaultProfile.underbaseMeshes;
   let ubEnabled = this.profile.underbaseEnabled ?? defaultProfile.underbaseEnabled;
   ubEnabled = Array.isArray(ubEnabled) ? [...ubEnabled] : [...defaultProfile.underbaseEnabled];
   ubEnabled[0] = true; // Underbase 1 always checked
   const ubKo = this.profile.underbaseKnockoutBlack ?? defaultProfile.underbaseKnockoutBlack;
   const formatInkNameLabel = this.profile.formatInkNameLabel ?? (this.profile as any).colorNameFormat ?? defaultProfile.formatInkNameLabel;
   this.formState = {
    ...defaultProfile,
    ...this.profile,
    overprintAllInks: this.profile.overprintAllInks ?? true,
    underbaseMeshes: Array.isArray(ub) ? [...ub] : [...defaultProfile.underbaseMeshes],
    underbaseEnabled: ubEnabled,
    underbaseKnockoutBlack: Array.isArray(ubKo) ? [...ubKo] : [...defaultProfile.underbaseKnockoutBlack],
    formatInkNameLabel,
    colorNameLabelFormat: this.profile.colorNameLabelFormat ?? defaultProfile.colorNameLabelFormat
   };
  } else {
   this.formState = { ...defaultProfile };
  }
 }

 onOverlayInteraction(event: MouseEvent): void {
  event.stopPropagation();
 }

 onInputChange(field: string, event: Event): void {
  const value = (event.target as HTMLInputElement | HTMLTextAreaElement).value;
  (this.formState as any)[field] = value;
 }

 onMeshChange(index: number, event: Event): void {
  const value = (event.target as HTMLInputElement).value;
  this.formState.underbaseMeshes = [...this.formState.underbaseMeshes];
  this.formState.underbaseMeshes[index] = value;
 }

 onCheckboxChange(field: keyof ProfileFormState, event: Event): void {
  const checked = (event.target as HTMLInputElement).checked;
  (this.formState as any)[field] = checked;
 }

 onUnderbaseEnabledChange(index: number, event: Event): void {
  if (index === 0) return; // Underbase 1 is always on, ignore
  const checked = (event.target as HTMLInputElement).checked;
  this.formState.underbaseEnabled = [...this.formState.underbaseEnabled];
  this.formState.underbaseEnabled[index] = checked;
 }

 onUnderbaseKnockoutChange(index: number, event: Event): void {
  const checked = (event.target as HTMLInputElement).checked;
  this.formState.underbaseKnockoutBlack = [...this.formState.underbaseKnockoutBlack];
  this.formState.underbaseKnockoutBlack[index] = checked;
 }

 onSubmit(event: Event): void {
  event.preventDefault();
  this.save.emit({
   ...this.formState,
   underbaseMeshes: [...this.formState.underbaseMeshes],
   underbaseEnabled: [...this.formState.underbaseEnabled],
   underbaseKnockoutBlack: [...this.formState.underbaseKnockoutBlack]
  });
 }

 onCancel(): void {
  this.close.emit();
 }

 /** True when any "k/o black inks" checkbox is checked (show Black inks k/o'd section). */
 isAnyKnockoutBlackChecked(): boolean {
  return this.formState.underbaseKnockoutBlack.some(b => b);
 }

 trackByIndex(index: number): number {
  return index;
 }
}
