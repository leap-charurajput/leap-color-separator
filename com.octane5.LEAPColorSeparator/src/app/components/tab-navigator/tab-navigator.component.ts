import { Component, Input, Output, EventEmitter } from '@angular/core';
import { GraphicsComponent } from '../../pages/graphics/graphics.component';
import { SeparationsComponent } from '../../pages/separations/separations.component';
import { SeparationColorsComponent } from '../../pages/separation-colors/separation-colors.component';
import { SettingsComponent } from '../../pages/settings/settings.component';
import { ControllerService } from '../../services/controller.service';

interface Tab {
	title: string;
	icon?: string;
	materialIcon?: string;
	component: any;
}

@Component({
 selector: 'app-tab-navigator',
 templateUrl: './tab-navigator.component.html',
 styleUrls: ['./tab-navigator.component.css']
})
export class TabNavigatorComponent {
 @Input() activeTab: number | null = 0;
 @Input() selectedMenuOption: string | null = null;
 @Input() documentRefreshKey = 0;
 @Output() onTabChange = new EventEmitter<number>();
 @Output() onMenuOptionClick = new EventEmitter<string>();
	@Output() onRemoveSeparationData = new EventEmitter<void>();

 constructor(private controller: ControllerService) {}

	tabs: Tab[] = [
		{ title: 'Graphics', component: GraphicsComponent },
		{ title: 'Separations', component: SeparationsComponent },
		{ title: 'Plates', icon: 'icon-ColorVar', component: SeparationColorsComponent }
	];

 menuOptions = [
 { title: 'Settings', component: SettingsComponent }
 ];

//  get headerMenuItems(): string[] {
//  const menuItems = [
//   'Mark as Reg mark',
//   'Remove separation data from team version'
//  ];

//  if (this.menuOptions.length > 0) {
//   if (menuItems.length > 0) {
//    menuItems.push('---');
//   }
//   this.menuOptions.forEach(option => {
//    menuItems.push(option.title);
//   });
//  }

//  return menuItems;
//  }

 handleTabClick(index: number): void {
 this.onTabChange.emit(index);
 }

//  handleHeaderMenuClick(item: string): void {
//  if (item === '---') return;

// 		if (item === 'Remove separation data from team version') {
// 			this.onRemoveSeparationData.emit();
// 			return;
// 		}

// 		if (item === 'Mark as Reg mark') {
// 			return;
// 		}

//  const menuOption = this.menuOptions.find(opt => opt.title === item);
//  if (menuOption && this.onMenuOptionClick) {
//   this.onMenuOptionClick.emit(item);
//   return;
//  }

//  }

 renderTabIcon(tab: Tab): string {
 return tab.materialIcon ? tab.materialIcon : '';
 }

 getTabId(title: string): string {
 return title.replace(/\s+/g, '');
 }
}
