import { ConnectedPosition } from '@angular/cdk/overlay';
import {
 ChangeDetectorRef,
 Component,
 ElementRef,
 EventEmitter,
 Input,
 OnChanges,
 Output,
 SimpleChanges,
 ViewChild
} from '@angular/core';

@Component({
 selector: 'app-combo-box',
 templateUrl: './combo-box.component.html',
 styleUrls: ['./combo-box.component.css']
})
export class ComboBoxComponent implements OnChanges {
 @Input() label?: string;
 @Input() value?: string;
 @Input() items: string[] = [];
 @Input() placeholder = 'Search or choose...';
 @Input() disabled = false;
 @Output() onChange = new EventEmitter<string>();

 @ViewChild('comboOrigin', { read: ElementRef }) comboOrigin!: ElementRef;

 isOpen = false;
 selectedValue = '';
 searchText = '';
 dropdownWidth = 0;

 positions: ConnectedPosition[] = [
  {
   originX: 'start',
   originY: 'bottom',
   overlayX: 'start',
   overlayY: 'top',
   offsetY: 0
  }
 ];

 constructor(private cdr: ChangeDetectorRef) {}

 ngOnChanges(changes: SimpleChanges): void {
  if (changes['value'] && changes['value'].currentValue !== undefined) {
   this.selectedValue = changes['value'].currentValue;
   this.searchText = changes['value'].currentValue;
  }
  if (changes['items']) {
   this.cdr.detectChanges();
  }
 }

 get filteredItems(): string[] {
  if (!this.searchText) return this.items;
  const lower = this.searchText.toLowerCase();
  return this.items.filter((item) => item.toLowerCase().includes(lower));
 }

 get displayValue(): string {
  return this.selectedValue || '';
 }

 handleInputClick(event: Event): void {
  if (this.disabled) return;
  event.stopPropagation();

  const rect = this.comboOrigin.nativeElement.getBoundingClientRect();
  this.dropdownWidth = rect.width;
  this.isOpen = true;
  this.cdr.detectChanges();
 }

 handleInputChange(event: Event): void {
  if (this.disabled) return;
  const value = (event.target as HTMLInputElement).value;
  this.searchText = value;

  const rect = this.comboOrigin.nativeElement.getBoundingClientRect();
  this.dropdownWidth = rect.width;
  this.isOpen = true;
  this.cdr.detectChanges();
 }

 handleInputKeyDown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
   this.closeDropdown();
  } else if (event.key === 'Enter') {
   // Select first filtered item on Enter
   if (this.filteredItems.length > 0) {
    this.handleItemClick(this.filteredItems[0]);
   }
  }
 }

 handleItemClick(item: string, event?: Event): void {
  if (event) {
   event.stopPropagation();
   event.preventDefault();
  }
  this.selectedValue = item;
  this.searchText = item;
  this.isOpen = false;
  this.onChange.emit(item);
  this.cdr.detectChanges();
 }

 closeDropdown(): void {
  this.isOpen = false;
  // Revert search text to selected value if no match
  this.searchText = this.selectedValue;
  this.cdr.detectChanges();
 }

 onBackdropClick(): void {
  this.closeDropdown();
 }
}
