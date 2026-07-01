import {
 ChangeDetectorRef,
 Component,
 EventEmitter,
 Input,
 OnChanges,
 Output,
 SimpleChanges
} from '@angular/core';

export interface CreateGraphicModalResult {
 position: string;
 name: string;
 width: number;
 height: number;
}

@Component({
 selector: 'app-create-graphic-modal',
 templateUrl: './create-graphic-modal.component.html',
 styleUrls: ['./create-graphic-modal.component.css']
})
export class CreateGraphicModalComponent implements OnChanges {
 @Input() isOpen = false;
 @Input() positionOptions: string[] = [];
 @Input() isSubmitting = false;
 @Input() warningMessage = '';

 @Output() cancel = new EventEmitter<void>();
 @Output() confirm = new EventEmitter<CreateGraphicModalResult>();

 position = '';
 name = 'Graphic';
 width = '3.00';
 height = '2.00';

 constructor(private cdr: ChangeDetectorRef) {}

 ngOnChanges(changes: SimpleChanges): void {
  if (changes['isOpen'] && this.isOpen) {
   this.resetState();
  }
 }

 private resetState(): void {
  this.position = '';
  this.name = 'Graphic';
  this.width = '3.00';
  this.height = '2.00';
  this.cdr.detectChanges();
 }

 get canSubmit(): boolean {
  if (this.isSubmitting) return false;
  const width = parseFloat(this.width);
  const height = parseFloat(this.height);
  return !!this.position.trim() && !!this.name.trim() && width > 0 && height > 0;
 }

 onPositionChange(value: string): void {
  this.position = value;
 }

 onCancel(): void {
  this.cancel.emit();
 }

 onCreate(): void {
  if (!this.canSubmit) return;
  this.confirm.emit({
   position: this.position.trim(),
   name: this.name.trim(),
   width: parseFloat(this.width),
   height: parseFloat(this.height)
  });
 }

 onDimensionKeypress(event: KeyboardEvent): void {
  const charCode = event.which ? event.which : event.keyCode;
  if (event.key === '.') {
   if ((event.target as HTMLInputElement).value.indexOf('.') >= 0) {
    event.preventDefault();
   }
   return;
  }
  if (charCode > 31 && (charCode < 48 || charCode > 57)) {
   event.preventDefault();
  }
 }
}
