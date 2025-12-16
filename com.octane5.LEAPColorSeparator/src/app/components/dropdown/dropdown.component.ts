import { Component, Input, Output, EventEmitter, ElementRef, ViewChild, HostListener, OnChanges, SimpleChanges, ChangeDetectorRef } from '@angular/core';

@Component({
 selector: 'app-dropdown',
 templateUrl: './dropdown.component.html',
 styleUrls: ['./dropdown.component.css']
})
export class DropdownComponent implements OnChanges {
 @Input() label?: string;
 @Input() value?: string;
 @Input() items: string[] = [];
 @Input() placeholder = 'Pick document...';
 @Output() onChange = new EventEmitter<string>();

 @ViewChild('dropdownRef') dropdownRef!: ElementRef;

 isOpen = false;
 selectedValue = '';

 constructor(private cdr: ChangeDetectorRef) {}

 @HostListener('document:click', ['$event'])
 onDocumentClick(event: MouseEvent): void {
 if (this.isOpen && this.dropdownRef && !this.dropdownRef.nativeElement.contains(event.target)) {
  this.isOpen = false;
  this.cdr.detectChanges();
 }
 }

 ngOnChanges(changes: SimpleChanges): void {
		if (changes['value'] && changes['value'].currentValue !== undefined) {
			this.selectedValue = changes['value'].currentValue;
		}
		if (changes['items']) {
			this.cdr.detectChanges();
		}
	}

 get displayValue(): string {
 return this.selectedValue || this.placeholder;
 }

 handleToggle(event: Event): void {
 event.stopPropagation();
 event.preventDefault();
 this.isOpen = !this.isOpen;
 this.cdr.detectChanges();
 }

 handleItemClick(item: string, event?: Event): void {
 if (event) {
  event.stopPropagation();
  event.preventDefault();
 }
 this.selectedValue = item;
 this.isOpen = false;
 this.onChange.emit(item);
 this.cdr.detectChanges();
 }
}
