import { Component, Input, Output, EventEmitter, ElementRef, ViewChild, AfterViewInit, ChangeDetectorRef } from '@angular/core';
import { ConnectedPosition } from '@angular/cdk/overlay';

@Component({
    selector: 'app-sub-menu',
    templateUrl: './sub-menu.component.html',
    styleUrls: ['./sub-menu.component.css']
})
export class SubMenuComponent implements AfterViewInit {
    @Input() items: string[] = [];
    @Input() iconClass = 'icon-ellipsis';
    @Output() onItemClick = new EventEmitter<string>();

    @ViewChild('openerRef', { read: ElementRef }) openerRef!: ElementRef;

    isOpen = false;
    positions: ConnectedPosition[] = [
        {
            originX: 'end',
            originY: 'bottom',
            overlayX: 'end',
            overlayY: 'top',
            offsetY: 4
        },
        {
            originX: 'start',
            originY: 'bottom',
            overlayX: 'start',
            overlayY: 'top',
            offsetY: 4
        }
    ];

    constructor(private cdr: ChangeDetectorRef) { }

    ngAfterViewInit(): void {
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
        this.isOpen = false;
        this.onItemClick.emit(item);
        this.cdr.detectChanges();
    }

    onBackdropClick(): void {
        this.isOpen = false;
        this.cdr.detectChanges();
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
