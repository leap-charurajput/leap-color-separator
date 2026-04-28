import {
 ChangeDetectorRef,
 Component,
 EventEmitter,
 Input,
 OnChanges,
 OnInit,
 Output,
 SimpleChanges
} from '@angular/core';
import { ControllerService } from '../../services/controller.service';

@Component({
 selector: 'app-compound-plate-modal',
 templateUrl: './compound-plate-modal.component.html',
 styleUrls: ['./compound-plate-modal.component.css']
})
export class CompoundPlateModalComponent implements OnInit, OnChanges {
 @Input() isOpen = false;
 @Input() editData: any = null;
 @Input() availableColors: string[] = [];
 @Input() spotColors: string[] = [];
 @Output() onClose = new EventEmitter<void>();
 @Output() onSave = new EventEmitter<any>();

 constructor(private controller: ControllerService, private cdr: ChangeDetectorRef) {}

 name = '';
 selectedComponents: string[] = [];
 mesh = '';
 micron = '';
 flashEnabled = false;
 coolEnabled = false;
 wbEnabled = false;
 specialInk = false;
 specialInkValue = '';
 generateChoke = false;
 chokeColor = '';
 fillColor = '';
 fillColors: String[] = [];

 ngOnInit(): void {
  this.initializeForm();
  this.loadSpotColors(); // ✅ Load once when component is created
 }

 private loadSpotColors(): void {
  this.controller
   .getSpotColorSwatches()
   .then((swatchNames) => {
    this.fillColors = swatchNames;
   })
   .catch((err) => {
    console.error('[COMPOUND-MODAL] Error loading spot colors:', err);
    this.spotColors = [];
   });
 }

 ngOnChanges(changes: SimpleChanges): void {
  if (changes['editData'] || changes['isOpen']) {
   this.initializeForm();
  }
 }

 initializeForm(): void {
  if (this.editData) {
   this.name = this.editData.colorName || '';
   this.selectedComponents = this.editData.components || [];
   this.mesh = this.editData.mesh || '';
   this.micron = this.editData.micron || '';
   this.flashEnabled = this.editData.flashEnabled || false;
   this.coolEnabled = this.editData.coolEnabled || false;
   this.wbEnabled = this.editData.wbEnabled || false;
   this.specialInk = this.editData.specialInk || false;
   this.specialInkValue = this.editData.specialInkValue || '';
   this.generateChoke = this.editData.generateChoke || false;
   this.chokeColor = this.editData.chokeColor || '';
   this.fillColor = this.editData.fillColor || '';
  } else {
   this.name = '';
   this.selectedComponents = [];
   this.mesh = '';
   this.micron = '';
   this.flashEnabled = false;
   this.coolEnabled = false;
   this.wbEnabled = false;
   this.specialInk = false;
   this.specialInkValue = '';
   this.generateChoke = false;
   this.chokeColor = '';
   this.fillColor = '';
  }
 }

 handleComponentToggle(colorName: string): void {
  if (this.selectedComponents.includes(colorName)) {
   this.selectedComponents = this.selectedComponents.filter((c) => c !== colorName);
  } else {
   this.selectedComponents = [...this.selectedComponents, colorName];
  }
 }

 isComponentSelected(colorName: string): boolean {
  return this.selectedComponents.includes(colorName);
 }

 handleGenerate(): void {
  const plateData = {
   colorName: this.name,
   components: this.selectedComponents,
   mesh: this.mesh,
   micron: this.micron,
   flashEnabled: this.flashEnabled,
   coolEnabled: this.coolEnabled,
   wbEnabled: this.wbEnabled,
   specialInk: this.specialInk,
   specialInkValue: this.specialInkValue,
   generateChoke: this.generateChoke,
   chokeColor: this.chokeColor,
   type: 'compound',
   fillColor: this.fillColor
  };

  this.controller
   .generateCompoundPlate(plateData.components, plateData.colorName, plateData.fillColor)
   .then((data) => {
    this.cdr.detectChanges();
   });

  console.log('LEEEM: ', { plateData });

  this.onSave.emit(plateData);
  this.onClose.emit();
 }

 handleCancel(): void {
  this.onClose.emit();
 }

 onOverlayClick(event: MouseEvent): void {
  event.stopPropagation();
 }

 onMeshInput(event: Event): void {
  const value = (event.target as HTMLInputElement).value;
  if (value === '' || /^\d+$/.test(value)) {
   this.mesh = value;
  }
 }

 onNameInput(event: Event): void {
  this.name = (event.target as HTMLInputElement).value;
  this.cdr.detectChanges();
 }

 onMicronInput(event: Event): void {
  const value = (event.target as HTMLInputElement).value;
  if (value === '' || /^\d+$/.test(value)) {
   this.micron = value;
  }
 }

 onSpecialInkValueChange(event: Event): void {
  this.specialInkValue = (event.target as HTMLSelectElement).value;
 }

 onChokeColorChange(event: Event): void {
  this.chokeColor = (event.target as HTMLSelectElement).value;
 }

 onFillColorChange(event: Event): void {
  this.fillColor = (event.target as HTMLSelectElement).value;
 }

 get isFormValid(): boolean {
  return this.name.trim() !== '';
 }
}
