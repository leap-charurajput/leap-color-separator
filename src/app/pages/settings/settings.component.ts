import { Component, OnInit } from '@angular/core';
import { csInterface } from '../../../libs/helper';
import { ControllerService } from '../../services/controller.service';

interface Profile {
 id: string;
 name: string;
 code: string;
 colorMesh: string;
 underbaseMeshes: string[];
 waterbaseInk: boolean;
 distress?: string;
 _jsonData?: any;
}

@Component({
 selector: 'app-settings',
 templateUrl: './settings.component.html',
 styleUrls: ['./settings.component.css']
})
export class SettingsComponent implements OnInit {
 profiles: Profile[] = [];
 isLoading = true;
 editModalOpen = false;
 selectedProfile: Profile | null = null;
 defaultMesh = '110';
 addUnderbase = true;
 artistName = '';
 artistInitials = '';
 selectedSection = 'Separation Profiles';

 // 🔑 Environment config
 environments = {
  Production: 'http://salesforce-connector.metadesign.org.in',
  Development: 'http://dev-leap-seps.metadesign.org.in',
  Localhost: 'http://localhost:6002'
 } as const;

 environmentKeys = Object.keys(this.environments) as Array<keyof typeof this.environments>;

 selectedEnvironmentKey: keyof typeof this.environments = 'Production';

 leapServerPath = '';

 constructor(private controller: ControllerService) {}

 async ngOnInit(): Promise<void> {
  this.loadProfiles();
  this.loadLeapServerPath();
  this.loadGeneralSettings();

  try {
   const result = await this.controller.getAppVersion();

   if (result) {
    const foundKey = this.environmentKeys.find((key) => this.environments[key] === result);

    if (foundKey) {
     this.selectedEnvironmentKey = foundKey;
    }
   }
  } catch (err) {
   console.error('Failed to get app version:', err);
  }
 }

 get selectedEnvironmentUrl(): string {
  return this.environments[this.selectedEnvironmentKey];
 }

 onEnvironmentChange(envKey: keyof typeof this.environments): void {
  this.selectedEnvironmentKey = envKey;

  this.controller.saveAppVersion(this.selectedEnvironmentUrl).then((result) => {
   if (result) {
    // console.log('Environment URL saved:', this.selectedEnvironmentUrl);
    // This reloads the panel iframe correctly
    csInterface.evalScript('app.redraw()');

    // Reload HTML
    window.location.reload();
    alert('Restart Adobe Illustrator for this change to take effect');
   } else {
    alert('Failed to save environment URL');
   }
  });
 }

 loadGeneralSettings(): void {
  this.controller.loadGeneralSettings().then((result) => {
   if (result.success && result.data) {
    this.defaultMesh = result.data.defaultMesh != null ? String(result.data.defaultMesh) : '110';
    this.addUnderbase = result.data.addUnderbase !== undefined ? result.data.addUnderbase : true;
    this.artistName = result.data.artistName != null ? String(result.data.artistName) : '';
    this.artistInitials = result.data.artistInitials != null ? String(result.data.artistInitials) : '';
   }
  });
 }

 saveGeneralSettings(): void {
  const settings = {
   defaultMesh: this.defaultMesh,
   addUnderbase: this.addUnderbase,
   artistName: this.artistName,
   artistInitials: this.artistInitials
  };
  this.controller.saveGeneralSettings(settings).then((result) => {
   if (!result.success) {
    console.error('Failed to save general settings:', result.error);
   }
  });
 }

 loadLeapServerPath(): void {
  this.controller.getLeapServerDataPath().then((path) => {
   this.leapServerPath = path;
  });
 }

 onChooseLeapPath(): void {
  this.controller.selectAndSaveLeapSettings().then((result) => {
   if (result.success && result.path) {
    this.leapServerPath = result.path;
   } else if (!result.cancelled) {
    // console.error('Error updating LEAP Data path', result.error);
   }
  });
 }

 loadProfiles(): void {
  this.isLoading = true;

  this.controller
   .getSeparationProfiles()
   .then((result) => {
    if (result.success && Array.isArray(result.profiles)) {
     this.profiles = result.profiles.map((jsonProfile: any, index: number) =>
      this.jsonToReactProfile(jsonProfile, index)
     );
    } else {
     this.profiles = [];
    }
   })
   .catch((err) => {
    this.profiles = [];
   })
   .finally(() => {
    this.isLoading = false;
   });
 }

 jsonToReactProfile(jsonProfile: any, index: number): Profile {
  const meshToString = (value: any) => {
   if (value === null || value === undefined || value === '' || value === ' ' || isNaN(value)) {
    return '';
   }
   return String(value);
  };

  const profileName = jsonProfile['Profile Name'] || '';
  const distress = jsonProfile['Distress'] || 'N';

  return {
   id: jsonProfile.id || this.generateId(profileName, distress),
   name: profileName,
   code: jsonProfile['Profile Code'] || '',
   colorMesh: meshToString(jsonProfile['Color Mesh']),
   underbaseMeshes: [
    meshToString(jsonProfile['UB 1 Mesh']),
    meshToString(jsonProfile['UB 2 Mesh']),
    meshToString(jsonProfile['UB 3 Mesh']),
    meshToString(jsonProfile['UB 4 Mesh'])
   ],
   waterbaseInk: jsonProfile['WB'] === 'Y' || jsonProfile['WB'] === true,
   distress: distress,
   _jsonData: jsonProfile
  };
 }

 reactToJsonProfile(reactProfile: Profile): any {
  const stringToNumberOrEmpty = (str: string) => {
   if (!str || str.trim() === '' || str === ' ') {
    return '';
   }
   const num = parseFloat(str);
   return isNaN(num) ? '' : num;
  };

  const jsonProfile: any = {
   'Profile Name': reactProfile.name || '',
   'Profile Code': reactProfile.code || '',
   'Color Mesh': stringToNumberOrEmpty(reactProfile.colorMesh),
   'UB 1 Mesh': stringToNumberOrEmpty(reactProfile.underbaseMeshes[0]),
   'UB 2 Mesh': stringToNumberOrEmpty(reactProfile.underbaseMeshes[1]),
   'UB 3 Mesh': stringToNumberOrEmpty(reactProfile.underbaseMeshes[2]),
   'UB 4 Mesh': stringToNumberOrEmpty(reactProfile.underbaseMeshes[3]),
   WB: reactProfile.waterbaseInk ? 'Y' : 'N'
  };

  if (reactProfile._jsonData) {
   jsonProfile.Distress = reactProfile._jsonData.Distress || 'N';
   jsonProfile['2 Hits'] = reactProfile._jsonData['2 Hits'] || 'N';
   jsonProfile.Blocker = reactProfile._jsonData.Blocker || 'N';
   jsonProfile.Flash =
    reactProfile._jsonData.Flash &&
    reactProfile._jsonData.Flash !== null &&
    !isNaN(reactProfile._jsonData.Flash)
     ? reactProfile._jsonData.Flash
     : '';
   jsonProfile.Cool =
    reactProfile._jsonData.Cool &&
    reactProfile._jsonData.Cool !== null &&
    !isNaN(reactProfile._jsonData.Cool)
     ? reactProfile._jsonData.Cool
     : '';
   jsonProfile.Micron = reactProfile._jsonData.Micron || 'XXX';
  } else {
   jsonProfile.Distress = 'N';
   jsonProfile['2 Hits'] = 'N';
   jsonProfile.Blocker = 'N';
   jsonProfile.Flash = '';
   jsonProfile.Cool = '';
   jsonProfile.Micron = 'XXX';
  }

  return jsonProfile;
 }

 generateId(name: string, distress?: string): string {
  const distressValue = distress || 'N';
  const combined = `${name}-${distressValue}`;
  return combined
   .toLowerCase()
   .replace(/[^a-z0-9]+/g, '-')
   .replace(/^-|-$/g, '');
 }

 saveProfiles(profilesToSave: Profile[]): Promise<any> {
  const jsonProfiles = profilesToSave.map((p) => this.reactToJsonProfile(p));
  return this.controller
   .saveSeparationProfiles(jsonProfiles)
   .then((result) => {
    if (!result.success) {
    }
    return result;
   })
   .catch((err) => {
    return { success: false, error: err.message || err.toString() };
   });
 }

 handleAddProfile(): void {
  this.selectedProfile = null;
  this.editModalOpen = true;
 }

 handleEditProfile(profile: Profile): void {
  this.selectedProfile = profile;
  this.editModalOpen = true;
 }

 handleDuplicateProfile(profile: Profile): void {
  const newProfile: Profile = {
   ...profile,
   id: this.generateId(profile.name + ' Copy'),
   name: profile.name + ' Copy',
   code: profile.code + '_COPY'
  };
  const updatedProfiles = [...this.profiles, newProfile];
  this.profiles = updatedProfiles;
  this.saveProfiles(updatedProfiles);
 }

 handleDeleteProfile(profile: Profile): void {
  if (!profile || !profile.id) {
   return;
  }

  const updatedProfiles = this.profiles.filter((p) => p.id !== profile.id);
  if (updatedProfiles.length === this.profiles.length) {
   return;
  }

  this.saveProfiles(updatedProfiles).then((result) => {
   if (result.success) {
    this.profiles = updatedProfiles;
   } else {
   }
  });
 }

 handleModalClose(): void {
  this.editModalOpen = false;
  this.selectedProfile = null;
 }

 handleModalSave(updatedProfile: Profile): void {
  let updatedProfiles: Profile[];
  if (this.selectedProfile && this.selectedProfile.id) {
   updatedProfiles = this.profiles.map((item) =>
    item.id === this.selectedProfile!.id ? { ...item, ...updatedProfile } : item
   );
  } else {
   const newProfile: Profile = {
    ...updatedProfile,
    id: updatedProfile.id || this.generateId(updatedProfile.name || 'new-profile')
   };
   updatedProfiles = [...this.profiles, newProfile];
  }

  this.profiles = updatedProfiles;
  this.saveProfiles(updatedProfiles);
  this.handleModalClose();
 }
}
