import { Component, EventEmitter, Input, Output } from '@angular/core';

@Component({
 selector: 'app-radio',
 templateUrl: './radio.component.html',
 styleUrls: ['./radio.component.css']
})
export class RadioComponent {
 @Input() checked = false;
 @Input() label = '';
 @Input() disabled = false;
 @Input() id = '';
 @Input() name = '';
 @Input() className = '';

 @Output() change = new EventEmitter<Event>();

 onRadioChange(event: Event): void {
  if (this.disabled) return;
  this.change.emit(event);
 }
}

