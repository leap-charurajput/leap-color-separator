import { Component, Input, Output, EventEmitter, ElementRef, ViewChild, HostListener, AfterViewInit } from '@angular/core';

@Component({
 selector: 'app-sub-menu',
 templateUrl: './sub-menu.component.html',
 styleUrls: ['./sub-menu.component.css']
})
export class SubMenuComponent implements AfterViewInit {
 @Input() items: string[] = [];
 @Input() iconClass = 'icon-ellipsis';
 @Output() onItemClick = new EventEmitter<string>();

 @ViewChild('openerRef') openerRef!: ElementRef;
 @ViewChild('menuRef') menuRef!: ElementRef;

 isOpen = false;
 menuPosition: 'up' | 'down' = 'down';

 @HostListener('document:mousedown', ['$event'])
 onDocumentClick(event: MouseEvent): void {
 if (this.openerRef && !this.openerRef.nativeElement.contains(event.target)) {
  this.isOpen = false;
 }
 }

 ngAfterViewInit(): void {

 }

 handleToggle(event: Event): void {
 event.stopPropagation();
 event.preventDefault(); // Prevent parent draggable elements from intercepting
 this.isOpen = !this.isOpen;
 // Always open downward - no position calculation needed
 this.menuPosition = 'down';
 }

 handleItemClick(item: string): void {
 this.isOpen = false;
 this.onItemClick.emit(item);
 }

 // Block drag/selection when interacting with the menu so row dragging doesn't eat clicks
 handleMouseDown(event: Event): void {
  event.stopPropagation();
  event.preventDefault();
 }

 handleDragStart(event: DragEvent): void {
  event.stopPropagation();
  event.preventDefault();
 }

}
