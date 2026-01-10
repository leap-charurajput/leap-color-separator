import { Component, Input, Output, EventEmitter, OnInit, OnChanges, SimpleChanges } from '@angular/core';

@Component({
 selector: 'app-edit-separation-modal',
 templateUrl: './edit-separation-modal.component.html',
 styleUrls: ['./edit-separation-modal.component.css']
})
export class EditSeparationModalComponent implements OnInit, OnChanges {
 @Input() isOpen = false;
 @Input() editData: any = null;
 @Output() onClose = new EventEmitter<void>();
 @Output() onSave = new EventEmitter<any>();

 name = '';
 mesh = '';
 micron = '';
 flashEnabled = false;
 coolEnabled = false;
 wbEnabled = false;

 ngOnInit(): void {
 // Initialize form if modal is already open when component is created
 if (this.isOpen) {
  this.initializeForm();
 }
 }

 ngOnChanges(changes: SimpleChanges): void {
 // Initialize form when modal opens (isOpen changes to true) or when editData changes
 if (changes['isOpen']) {
  if (this.isOpen) {
   // Modal is opening - initialize form with editData
   this.initializeForm();
  }
 } else if (changes['editData'] && this.isOpen) {
  // editData changed while modal is open - update form
  this.initializeForm();
 }
 }

 initializeForm(): void {
 if (this.editData) {
  this.name = this.editData.colorName || '';
  this.mesh = this.editData.mesh || '';
  this.micron = this.editData.micron || '';
  this.flashEnabled = this.editData.flashEnabled || false;
  this.coolEnabled = this.editData.coolEnabled || false;
  this.wbEnabled = this.editData.wbEnabled || false;
 } else {
  this.name = '';
  this.mesh = '';
  this.micron = '';
  this.flashEnabled = false;
  this.coolEnabled = false;
  this.wbEnabled = false;
 }
 }

 handleOk(): void {
 const plateData = {
  colorName: this.name,
  mesh: this.mesh,
  micron: this.micron,
  flashEnabled: this.flashEnabled,
  coolEnabled: this.coolEnabled,
  wbEnabled: this.wbEnabled
 };
 this.onSave.emit(plateData);
 // Don't emit onClose here - let the parent handle closing after save
 }

 handleCancel(): void {
 this.onClose.emit();
 }

 handleOverlayInteraction(event: MouseEvent): void {
 if (event.target === event.currentTarget) {
  this.handleCancel();
 }
 }

 onNameInput(event: Event): void {
 this.name = (event.target as HTMLInputElement).value;
 }

 onMeshInput(event: Event): void {
 const value = (event.target as HTMLInputElement).value;
 if (value === '' || /^\d+$/.test(value)) {
  this.mesh = value;
 }
 }

 onMicronInput(event: Event): void {
 this.micron = (event.target as HTMLInputElement).value;
 }

 get isFormValid(): boolean {
 return this.name.trim() !== '';
 }
}
