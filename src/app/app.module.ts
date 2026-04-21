import { DragDropModule } from '@angular/cdk/drag-drop';
import { NgModule } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BrowserModule } from '@angular/platform-browser';

import { OverlayModule } from '@angular/cdk/overlay';

import { AppComponent } from './app.component';
import { ButtonComponent } from './components/button/button.component';
import { CheckboxComponent } from './components/checkbox/checkbox.component';
import { ConfirmDialogComponent } from './components/confirm-dialog/confirm-dialog.component';
import { CompoundPlateModalComponent } from './components/compound-plate-modal/compound-plate-modal.component';
import { DropdownComponent } from './components/dropdown/dropdown.component';
import { EditSeparationModalComponent } from './components/edit-separation-modal/edit-separation-modal.component';
import { EditSeparationProfileModalComponent } from './components/edit-separation-profile-modal/edit-separation-profile-modal.component';
import { ExportSeparationsModalComponent } from './components/export-separations-modal/export-separations-modal.component';
import { LayerStackVisualizationComponent } from './components/layer-stack-visualization/layer-stack-visualization.component';
import { LinkColorsModalComponent } from './components/link-colors-modal/link-colors-modal.component';
import { ProfilesTableComponent } from './components/profiles-table/profiles-table.component';
import { SeparationProfilesPanelComponent } from './components/separation-profiles-panel/separation-profiles-panel.component';
import { SubMenuComponent } from './components/sub-menu/sub-menu.component';
import { TabNavigatorComponent } from './components/tab-navigator/tab-navigator.component';
import { GraphicsComponent } from './pages/graphics/graphics.component';
import { SeparationColorsComponent } from './pages/separation-colors/separation-colors.component';
import { SeparationsComponent } from './pages/separations/separations.component';
import { SettingsComponent } from './pages/settings/settings.component';

import { ComboBoxComponent } from './components/combo-box/combo-box.component';
import { ControllerService } from './services/controller.service';

@NgModule({
 declarations: [
  AppComponent,
  TabNavigatorComponent,
  SubMenuComponent,
  ButtonComponent,
  ConfirmDialogComponent,
  ComboBoxComponent,
  DropdownComponent,
  EditSeparationModalComponent,
  CompoundPlateModalComponent,
  LayerStackVisualizationComponent,
  CheckboxComponent,
  LinkColorsModalComponent,
  ProfilesTableComponent,
  SeparationProfilesPanelComponent,
  EditSeparationProfileModalComponent,
  ExportSeparationsModalComponent,
  SeparationColorsComponent,
  GraphicsComponent,
  SeparationsComponent,
  SettingsComponent
 ],
 imports: [BrowserModule, FormsModule, DragDropModule, OverlayModule],
 providers: [ControllerService],
 bootstrap: [AppComponent]
})
export class AppModule { }
