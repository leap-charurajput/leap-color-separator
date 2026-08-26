import { ChangeDetectorRef, Component, HostListener, OnDestroy, OnInit } from '@angular/core';
import { checkForJSXUpdates } from '../libs/helper';
import { ControllerService } from './services/controller.service';
import { GraphicsDataService } from './services/graphics-data.service';
import { LeapSepsLogService } from './services/leap-seps-log.service';
import { roiShipOnLaunch, roiPingLogin } from './services/roi';
import { errInit } from './services/errlog';
import { flareInit } from './services/flare';

@Component({
 selector: 'app-root',
 templateUrl: './app.component.html',
 styleUrls: ['./app.component.css']
})
export class AppComponent implements OnInit, OnDestroy {
 private readonly panelVersion = '1.0.2';
 /** Bump this string when you ship a new build (same format as before: "Mon DD, YYYY"). */
 private readonly panelDeployDate = 'August 26, 2026';
 activeTab: number | null = 0;
 selectedMenuOption: string | null = null;
 documentRefreshKey = 0;
 /*
  * The standalone (non-LEAP) separation form is a MODAL opened by the Graphics "+" button, not a
  * tab. `pendingStandaloneJob` pre-fills it from a job already recorded on the document (used when
  * Generate is pressed on a Separations-tab row); null means a fresh form.
  */
 standaloneOpen = false;
 pendingStandaloneJob: any = null;
 private documentActivateListener: any;
 private flyoutMenuListener: any;
 showConfirmDialog = false;
 confirmError: string | null = null;
 postscriptIssues: Array<{ id: string; message: string }> = [];

 get panelBuildStamp(): string {
  return `${this.panelDeployDate} | v${this.panelVersion}`;
 }

 constructor(
  private controller: ControllerService,
  private cdr: ChangeDetectorRef,
  private graphicsDataService: GraphicsDataService,
  private leapSepsLog: LeapSepsLogService
 ) { }

 ngOnInit(): void {
  /* Panel version for the log-file session banner (logging only). Set before anything else logs. */
  try {
   (window as any).__LEAP_PANEL_VERSION__ = this.panelBuildStamp;
   this.leapSepsLog.logInfo('Panel', 'LEAP Color Separator panel ' + this.panelBuildStamp + ' ready');
  } catch (e) { /* ignore */ }
  document.body.classList.add('dark');
  this.leapSepsLog.logProcess('LEAP Color Separator panel opened', {
   version: this.panelVersion,
   deployDate: this.panelDeployDate
  });
  // ROI: ship completed days' event files + daily login ping (guarded; never throws).
  // NOTE: restored 2026-07-02 — an earlier refactor dropped these calls.
  roiShipOnLaunch();
  roiPingLogin();
  // Error capture: uncaught errors + offline retry (guarded; never throws)
  errInit();
  // Flare "Report a problem": start the rolling ops trail + capture console.error/warn
  // (guarded; never throws). Breadcrumbs are added via flareOp(...) at key operations.
  flareInit();

  checkForJSXUpdates((window as any).location.origin).then((res) => {
   console.log('check update status ref', res);
  });

  this.waitForSession()
   .then(() => {
    this.registerDocumentActivateListener();
    this.registerFlyoutMenu();
    this.refreshPostscriptReadiness();

    (window as any).__LEAP_TAB_NAVIGATION__ = {
     navigateToTab: (index: number) => {
      this.onTabChange(index);
     },
     /* Opens the standalone form modal (used by the Graphics "+" button). */
     openStandalone: () => {
      this.openStandaloneSeparation();
     }
    };
    /* Opens the standalone form pre-filled from a job already recorded on the document — used by
       the Generate button on a Separations-tab standalone row. */
    (window as any).__LEAP_STANDALONE__ = {
     openWithJob: (job: any) => {
      this.openStandaloneSeparation(job);
     }
    };
    /* Called by the form itself once Export has handed over to the Separations tab. */
    (window as any).__LEAP_STANDALONE_CLOSE__ = () => {
     this.closeStandaloneSeparation();
    };
   })
   .catch((err) => {
    this.leapSepsLog.logError('App', err, 'waitForSession failed');
    (window as any).__LEAP_TAB_NAVIGATION__ = {
     navigateToTab: (index: number) => {
      this.onTabChange(index);
     },
     /* Opens the standalone form modal (used by the Graphics "+" button). */
     openStandalone: () => {
      this.openStandaloneSeparation();
     }
    };
    /* Opens the standalone form pre-filled from a job already recorded on the document — used by
       the Generate button on a Separations-tab standalone row. */
    (window as any).__LEAP_STANDALONE__ = {
     openWithJob: (job: any) => {
      this.openStandaloneSeparation(job);
     }
    };
    /* Called by the form itself once Export has handed over to the Separations tab. */
    (window as any).__LEAP_STANDALONE_CLOSE__ = () => {
     this.closeStandaloneSeparation();
    };
   });
 }

 @HostListener('document:click', ['$event'])
 onDocumentClick(event: MouseEvent): void {
  const target = event.target as HTMLElement | null;
  if (!target) return;
  const interactive = target.closest(
   'button, a, [role="button"], [role="tab"], input[type="button"], input[type="submit"], .profile-modal-tab, .current-sep-action-link'
  ) as HTMLElement | null;
  if (!interactive) return;

  const label =
   interactive.getAttribute('aria-label') ||
   interactive.getAttribute('title') ||
   interactive.textContent?.trim().slice(0, 120) ||
   interactive.className ||
   interactive.tagName;

  const section =
   interactive.closest(
    'app-separations, app-separation-colors, app-graphics, app-settings, app-edit-separation-profile-modal'
   )?.tagName || 'app-root';

  this.leapSepsLog.logClick('Click: ' + label, {
   section,
   tag: interactive.tagName,
   id: interactive.id || undefined,
   class: interactive.className || undefined
  });
 }

 private waitForSession(maxRetries: number = 50, delayMs: number = 100): Promise<void> {
  return new Promise((resolve, reject) => {
   let retries = 0;
   const isInCEP = !!(window as any).__adobe_cep__;

   const checkSession = () => {
    if ((window as any).leap) {
     resolve();
    } else if (retries < maxRetries) {
     retries++;
     setTimeout(checkSession, delayMs);
    } else {
     if (isInCEP) {
     }
     reject(new Error('Leap not available after retries'));
    }
   };
   checkSession();
  });
 }

 ngOnDestroy(): void {
  if (this.documentActivateListener) {
   this.documentActivateListener();
  }
  if (this.flyoutMenuListener) {
   this.flyoutMenuListener();
  }
  delete (window as any).__LEAP_TAB_NAVIGATION__;
  delete (window as any).__LEAP_STANDALONE__;
  delete (window as any).__LEAP_STANDALONE_CLOSE__;
  delete (window as any).__LEAP_DOCUMENT_EVENT__;
  delete (window as any)._LEAP_FLYOUT_MENU_EVENT__;
 }

 onTabChange(index: number): void {
  const tabNames = ['Graphics', 'Separations', 'Plates'];
  this.leapSepsLog.logClick('Tab: ' + (tabNames[index] ?? String(index)), { index });
  this.activeTab = index;
  this.selectedMenuOption = null;
  /*
   * Tab switching no longer has to manage the standalone form — it lives in a modal now.
   */
  // Refetch document/XMP when switching to Separations (1) or Plates (2) so the UI reflects the
  // current front document — e.g. the standalone separation lands on Plates and must read the new
  // separated document's plate list.
  if (index === 1 || index === 2) {
   this.documentRefreshKey++;
   this.cdr.detectChanges();
  }
 }

 /*
  * Open the standalone (non-LEAP) separation form as a MODAL. Invoked from the Graphics "+" button
  * via window.__LEAP_TAB_NAVIGATION__.openStandalone(), and from a Separations-tab row via
  * window.__LEAP_STANDALONE__.openWithJob(job) — in which case the form is pre-filled from the job
  * that was recorded on the document at Export.
  */
 openStandaloneSeparation(job?: any): void {
  this.pendingStandaloneJob = job || null;
  this.standaloneOpen = true;
  /*
   * The form lives INLINE on the Graphics tab, so making it VISIBLE means routing there. Skipped for
   * an autoGenerate job: that runs headlessly and finishes on Plates, so yanking the user to Graphics
   * on the way would just be a flash of the wrong tab. Tab contents stay mounted either way, so the
   * form can still do its work while another tab is in front.
   */
  if (!job || !job.autoGenerate) {
   this.onTabChange(0);
  }
  const openInline = (window as any).__LEAP_GRAPHICS_STANDALONE__;
  if (openInline && typeof openInline.open === 'function') {
   openInline.open(job || null);
  }
  this.cdr.detectChanges();
  /*
   * Ask the form to (re)prefill from the active document's LICENSING sheet. Skipped when a stored
   * job was supplied — those values win and a LICENSING read would overwrite them. The hook is
   * registered by the form in its ngOnInit; guarded because it has only just been created.
   */
  if (!job) {
   const prefill = (window as any).__LEAP_STANDALONE_PREFILL__;
   if (typeof prefill === 'function') {
    prefill();
   }
  }
 }

 /* Close the inline form. *ngIf destroys it, so its state is discarded — reopening starts clean. */
 closeStandaloneSeparation(): void {
  this.standaloneOpen = false;
  this.pendingStandaloneJob = null;
  const openInline = (window as any).__LEAP_GRAPHICS_STANDALONE__;
  if (openInline && typeof openInline.close === 'function') {
   openInline.close();
  }
  this.cdr.detectChanges();
 }

 onMenuOptionClick(title: string): void {
  this.selectedMenuOption = title;
  this.activeTab = null;
 }

 private refreshPostscriptReadiness(): void {
  if (!(window as any).__adobe_cep__) {
   this.postscriptIssues = [];
   return;
  }
  this.controller.checkPostscriptReadiness({ requireDocument: false }).then((result: any) => {
   if (result?.success) {
    this.postscriptIssues = Array.isArray(result.issues) ? result.issues : [];
    this.cdr.detectChanges();
   }
  }).catch(() => { });
 }

 private selectTabByName(tabName: string): void {
  this.selectedMenuOption = null;
  switch (tabName) {
   case 'Graphics':
    this.activeTab = 0;
    break;
   case 'Separations':
    this.activeTab = 1;
    break;
   case 'SeparationColors':
    this.activeTab = 2;
    break;
   default:
    if (typeof this.activeTab !== 'number') {
     this.activeTab = 0;
    }
    break;
  }
  this.cdr.detectChanges();
 }

 private async autoSelectTabForActiveDocument(): Promise<void> {
  // If session not ready, skip quietly
  if (!this.controller.hasSession || !this.controller.hasSession()) {
   return;
  }

  /*
   * While the standalone form is open, do NOT auto-switch tabs when a document activates: the
   * Export/Generate actions open and close documents themselves, and re-routing underneath the form
   * would move the user away mid-entry.
   */
  if (this.standaloneOpen) {
   return;
  }
  /*
   * Also stay put during the export handover. Export closes the exported document and re-activates
   * the source one; without this the resulting activation would route the user to Graphics and undo
   * the navigation to the Separations tab that the handover just performed.
   */
  const handoverUntil = (window as any).__LEAP_STANDALONE_HANDOVER_UNTIL__;
  if (typeof handoverUntil === 'number' && Date.now() < handoverUntil) {
   return;
  }

  try {
   // First, check if this is a separation document (DocumentType == "Separation Document")
   const sepResult = await this.controller.checkSeparatedDocument();
   if (sepResult && sepResult.success && sepResult.data && sepResult.data.isSeparatedDoc) {
    this.selectTabByName('SeparationColors');
    return;
   }

   // Not a separation doc: check GraphicsOrganizationData
   const gfxResult = await this.controller.loadGraphicsData();
   if (
    gfxResult &&
    gfxResult.success &&
    Array.isArray(gfxResult.graphicsData) &&
    gfxResult.graphicsData.length > 0
   ) {
    this.selectTabByName('Separations');
   } else {
    // Team version without organization data -> default to Graphics. (Non-LEAP docs also land
    // here; the Graphics tab itself auto-opens the inline standalone form for them — see
    // graphics.component maybeAutoOpenStandaloneForm.)
    this.selectTabByName('Graphics');
   }
  } catch (err) {
   // On failure, leave current tab unchanged
   console.error('[APP] Error auto-selecting tab on document activate:', err);
  }
 }

 private registerDocumentActivateListener(): void {
  if (!(window as any).leap) {
   return;
  }

  try {
   const scriptLoader = (window as any).leap.scriptLoader();
   if (!scriptLoader || !scriptLoader.cs) {
    return;
   }

   const csInterface = scriptLoader.cs;
   if (typeof csInterface.addEventListener !== 'function') {
    return;
   }

   const EVENT_DOCUMENT_ACTIVATE = 'documentAfterActivate';

   const handleDocumentActivate = () => {
    this.documentRefreshKey++;
    this.refreshPostscriptReadiness();
    this.cdr.detectChanges();
    this.autoSelectTabForActiveDocument();
   };

   csInterface.addEventListener(EVENT_DOCUMENT_ACTIVATE, handleDocumentActivate);

   (window as any).__LEAP_DOCUMENT_EVENT__ = {
    csInterface,
    eventName: EVENT_DOCUMENT_ACTIVATE,
    handler: handleDocumentActivate
   };

   // Run once on init to set correct tab for the current front document
   this.autoSelectTabForActiveDocument();

   this.documentActivateListener = () => {
    if (typeof csInterface.removeEventListener === 'function') {
     csInterface.removeEventListener(EVENT_DOCUMENT_ACTIVATE, handleDocumentActivate);
    }
   };
  } catch (err) { }
 }

 private registerFlyoutMenu(): void {
  if (!(window as any).leap) {
   return;
  }

  try {
   const scriptLoader = (window as any).leap.scriptLoader();
   const csInterface = scriptLoader?.cs;

   if (
    !csInterface ||
    typeof csInterface.addEventListener !== 'function' ||
    typeof csInterface.setPanelFlyoutMenu !== 'function'
   ) {
    return;
   }

   const EVENT_FLYOUT_MENU_CLICKED = 'com.adobe.csxs.events.flyoutMenuClicked';

   const handleFlyoutMenuClicked = (event: any) => {
    switch (event?.data?.menuId) {
     case 'removeSeparationDataFromTeamVersion':
      this.openRemoveConfirmation();
      break;

     case 'markAsReg':
      break;

     case 'leapServerSettings':
      this.controller.selectAndSaveLeapSettings().then((result: any) => {
       if (result.success) {
        console.log(`Leap path updated successfully`);
       } else if (!result.cancelled) {
        console.error(`Error updating LEAP Data path: ${result.error}`);
       }
      });
      break;

     default:
      break;
    }
    this.cdr.detectChanges();
   };

   const flyoutXML =
    '\
				<Menu> \
					<MenuItem Id="markAsReg" Label="Mark as Reg mark" Enabled="true"/> \
					<MenuItem Id="removeSeparationDataFromTeamVersion" Label="Remove separation data from team version" Enabled="true"/> \
				</Menu>';
   csInterface.setPanelFlyoutMenu(flyoutXML);

   csInterface.addEventListener(EVENT_FLYOUT_MENU_CLICKED, handleFlyoutMenuClicked);

   (window as any)._LEAP_FLYOUT_MENU_EVENT__ = {
    csInterface,
    eventName: EVENT_FLYOUT_MENU_CLICKED,
    handler: handleFlyoutMenuClicked
   };

   this.flyoutMenuListener = () => {
    if (typeof csInterface.removeEventListener === 'function') {
     csInterface.removeEventListener(EVENT_FLYOUT_MENU_CLICKED, handleFlyoutMenuClicked);
    }
   };
  } catch (err) { }
 }

 openRemoveConfirmation(): void {
  this.confirmError = null;
  this.showConfirmDialog = true;
 }

 handleCancelRemove(): void {
  this.showConfirmDialog = false;
  this.confirmError = null;
  this.cdr.detectChanges();
 }

 async handleConfirmRemove(): Promise<void> {
  this.confirmError = null;

  if (!this.controller || !this.controller.hasSession || !this.controller.hasSession()) {
   this.confirmError = 'Session not available.';
   this.cdr.detectChanges();
   return;
  }

  try {
   const result = await this.controller.removeSeparationData();
   this.showConfirmDialog = false;

   if (result?.success) {
    /*
     * The XMP wipe covers LEAPStandaloneJobs (same ColorSeparator namespace), but the standalone
     * SIDECAR JSONs live on disk and would silently restore the form on the next open — making
     * the remove look like it failed. Delete this document's sidecars too (doc-specific match).
     */
    await this.deleteStandaloneSidecarsForActiveDoc();
    this.documentRefreshKey++;
    this.graphicsDataService.resetData();
    if ((window as any).__LEAP_DOCUMENT_EVENT__?.handler) {
     (window as any).__LEAP_DOCUMENT_EVENT__.handler();
    }
   } else {
    const msg = 'Error removing separation data: ' + (result?.error || 'Unknown error');
    console.error('[APP] removeSeparationData failed', result);
    this.confirmError = msg;
    this.showConfirmDialog = true;
   }
  } catch (err: any) {
   const msg = 'Error removing separation data: ' + (err?.message || 'Unknown error');
   console.error('[APP] removeSeparationData exception', err);
   this.confirmError = msg;
   this.showConfirmDialog = true;
  } finally {
   this.cdr.detectChanges();
  }
 }

 /*
  * Companion cleanup for "Remove Seps data": delete the ACTIVE document's standalone sidecar JSONs
  * (<docFolder>/ASSETS/*.json whose sourceDocumentPath is this document). Without this, the sidecar
  * restore layer silently re-fills the standalone form on the next open even though the XMP was
  * wiped. Doc-specific match only — sidecars belonging to OTHER source documents in a shared
  * ASSETS folder are left untouched. Best-effort: a cleanup failure never fails the remove.
  */
 private async deleteStandaloneSidecarsForActiveDoc(): Promise<void> {
  try {
   const req = (window as any).cep_node?.require;
   if (!req || typeof this.controller.getActiveDocumentPath !== 'function') return;
   const docPath = String((await this.controller.getActiveDocumentPath()) || '').trim();
   if (!docPath) return;

   const fs = req('fs');
   const path = req('path');
   const norm = (p: any) => String(p || '').split('\\').join('/').trim().toLowerCase();
   const docNorm = norm(docPath);
   const assetsDir = path.join(path.dirname(docPath), 'ASSETS');
   if (!fs.existsSync(assetsDir)) return;

   for (const f of fs.readdirSync(assetsDir)) {
    if (!/\.json$/i.test(String(f))) continue;
    const jp = path.join(assetsDir, f);
    try {
     const sc = JSON.parse(fs.readFileSync(jp, 'utf8'));
     if (sc && norm(sc.sourceDocumentPath) === docNorm) {
      fs.unlinkSync(jp);
      console.log('[APP] Removed standalone sidecar:', jp);
     }
    } catch (e) {
     /* unreadable/foreign sidecar — leave it */
    }
   }
  } catch (e) {
   console.warn('[APP] Standalone sidecar cleanup failed (non-fatal):', e);
  }
 }
}
