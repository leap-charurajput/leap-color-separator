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
 this.isOpen = !this.isOpen;
 if (this.isOpen) {
  this.calculatePosition();
 }
 }

 handleItemClick(item: string): void {
 this.isOpen = false;
 this.onItemClick.emit(item);
 }

 private calculatePosition(): void {
 setTimeout(() => {
  if (!this.menuRef || !this.openerRef) return;

  const menuEl = this.menuRef.nativeElement;
  const openerEl = this.openerRef.nativeElement;
  const boundaryEl = openerEl.closest('[data-submenu-boundary]');
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
  const boundaryRect = boundaryEl
  ? boundaryEl.getBoundingClientRect()
  : { top: 0, bottom: viewportHeight };

  const openerRect = openerEl.getBoundingClientRect();
  const menuHeight = menuEl.offsetHeight;
  const spaceBelow = boundaryRect.bottom - openerRect.bottom;
  const spaceAbove = openerRect.top - boundaryRect.top;

  if (spaceBelow < menuHeight && spaceAbove > spaceBelow) {
  this.menuPosition = 'up';
  } else {
  this.menuPosition = 'down';
  }
 }, 0);
 }
}
