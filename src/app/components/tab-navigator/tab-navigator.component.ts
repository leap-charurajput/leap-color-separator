import { Component, EventEmitter, Input, Output, OnChanges, SimpleChanges } from '@angular/core';
import { GraphicsComponent } from '../../pages/graphics/graphics.component';
import { SeparationColorsComponent } from '../../pages/separation-colors/separation-colors.component';
import { SeparationsComponent } from '../../pages/separations/separations.component';
import { SettingsComponent } from '../../pages/settings/settings.component';
import { StandaloneSeparationComponent } from '../../pages/standalone-separation/standalone-separation.component';
import { ControllerService } from '../../services/controller.service';

interface Tab {
 title: string;
 icon?: string;
 materialIcon?: string;
 component: any;
 /*
  * When true the tab is only clickable while its gate (see standaloneEnabled) is open.
  * Used by the Standalone tab, which stays visible but disabled until the Graphics "+"
  * button enables it.
  */
 gated?: boolean;
}

@Component({
 selector: 'app-tab-navigator',
 templateUrl: './tab-navigator.component.html',
 styleUrls: ['./tab-navigator.component.css']
})
export class TabNavigatorComponent implements OnChanges {
 @Input() activeTab: number | null = 0;
 @Input() selectedMenuOption: string | null = null;
 @Input() documentRefreshKey = 0;
 @Input() postscriptIssues: Array<{ id: string; message: string }> = [];
 /*
  * Gate for the Standalone tab: false keeps it visible-but-disabled; the shell flips it true
  * when the user clicks "+" on the Graphics tab with a live selection.
  */
 @Input() standaloneEnabled = false;
 @Output() onTabChange = new EventEmitter<number>();
 @Output() onMenuOptionClick = new EventEmitter<string>();
 @Output() onRemoveSeparationData = new EventEmitter<void>();

 postscriptDetailOpen = false;

 /** Menu option key used to open the "Report a problem" pane. */
 readonly reportMenuOption = 'Report a Problem';

 constructor(private controller: ControllerService) {}

 tabs: Tab[] = [
  { title: 'Graphics', component: GraphicsComponent },
  { title: 'Separations', component: SeparationsComponent },
  { title: 'Plates', icon: 'icon-ColorVar', component: SeparationColorsComponent },
  /*
   * Standalone (non-LEAP) separation tab. Always rendered so its position (after Plates) is
   * stable, but gated: the user cannot activate it directly — only the Graphics "+" button
   * enables it (see standaloneEnabled / isTabDisabled).
   */
  // { title: 'Standalone', icon: 'icon-ColorVar', component: StandaloneSeparationComponent, gated: true }
 ];

 menuOptions = [
  { title: 'General Settings', component: SettingsComponent },
  { title: 'Manage Profiles', component: SettingsComponent },
  { title: 'Export Settings', component: SettingsComponent }
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

 /*
  * A gated tab (Standalone) is disabled until its gate is open. Non-gated tabs are always
  * clickable.
  */
 isTabDisabled(tab: Tab): boolean {
  return !!tab.gated && !this.standaloneEnabled;
 }

 handleTabClick(index: number): void {
  /* Block activation of a gated tab that has not been enabled yet. */
  const tab = this.tabs[index];
  if (tab && this.isTabDisabled(tab)) {
   return;
  }
  this.onTabChange.emit(index);
 }

 handleSettingsMenuClick(item: string): void {
  const menuOption = this.menuOptions.find((option) => option.title === item);
  if (!menuOption) {
   return;
  }
  this.onMenuOptionClick.emit(item);
 }

 handleReportClick(): void {
  this.onMenuOptionClick.emit(this.reportMenuOption);
 }

 getSettingsSection(selectedOption: string | null): string {
  if (selectedOption === 'General Settings') return 'General Settings';
  if (selectedOption === 'Export Settings') return 'Export Settings';
  return 'Separation Profiles';
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

 onPostscriptDetailOpenChange(open: boolean): void {
  this.postscriptDetailOpen = open;
 }

 closePostscriptDetail(): void {
  this.postscriptDetailOpen = false;
 }

 ngOnChanges(changes: SimpleChanges): void {
  if (changes['postscriptIssues'] && !this.postscriptIssues?.length) {
   this.postscriptDetailOpen = false;
  }
 }
}
