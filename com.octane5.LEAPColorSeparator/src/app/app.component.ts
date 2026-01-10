import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { ControllerService } from './services/controller.service';

@Component({
	selector: 'app-root',
	templateUrl: './app.component.html',
	styleUrls: ['./app.component.css']
})
export class AppComponent implements OnInit, OnDestroy {
	activeTab: number | null = 0;
	selectedMenuOption: string | null = null;
	documentRefreshKey = 0;
	private documentActivateListener: any;
	private flyoutMenuListener: any;
	showConfirmDialog = false;
	confirmError: string | null = null;

	constructor(
		private controller: ControllerService,
		private cdr: ChangeDetectorRef
	) { }

	ngOnInit(): void {
		document.body.classList.add('dark');

		this.waitForSession().then(() => {
			this.registerDocumentActivateListener();
			this.registerFlyoutMenu();

			(window as any).__LEAP_TAB_NAVIGATION__ = {
				navigateToTab: (index: number) => {
					this.activeTab = index;
					this.selectedMenuOption = null;
					this.cdr.detectChanges();
				}
			};
		}).catch(() => {
			(window as any).__LEAP_TAB_NAVIGATION__ = {
				navigateToTab: (index: number) => {
					this.activeTab = index;
					this.selectedMenuOption = null;
					this.cdr.detectChanges();
				}
			};
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
		delete (window as any).__LEAP_DOCUMENT_EVENT__;
		delete (window as any)._LEAP_FLYOUT_MENU_EVENT__;
	}

	onTabChange(index: number): void {
		this.activeTab = index;
		this.selectedMenuOption = null;
	}

	onMenuOptionClick(title: string): void {
		this.selectedMenuOption = title;
		this.activeTab = null;
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

		try {
			// First, check if this is a separation document (DocumentType == "Separation Document")
			const sepResult = await this.controller.checkSeparatedDocument();
			if (sepResult && sepResult.success && sepResult.data && sepResult.data.isSeparatedDoc) {
				this.selectTabByName('SeparationColors');
				return;
			}

			// Not a separation doc: check GraphicsOrganizationData
			const gfxResult = await this.controller.loadGraphicsData();
			if (gfxResult && gfxResult.success && Array.isArray(gfxResult.graphicsData) && gfxResult.graphicsData.length > 0) {
				this.selectTabByName('Separations');
			} else {
				// Team version without organization data -> default to Graphics
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
		} catch (err) {

		}
	}

	private registerFlyoutMenu(): void {
		if (!(window as any).leap) {
			return;
		}

		try {
			const scriptLoader = (window as any).leap.scriptLoader();
			const csInterface = scriptLoader?.cs;

			if (!csInterface || typeof csInterface.addEventListener !== 'function' || typeof csInterface.setPanelFlyoutMenu !== 'function') {
				return;
			}

			const EVENT_FLYOUT_MENU_CLICKED = 'com.adobe.csxs.events.flyoutMenuClicked';

			const handleFlyoutMenuClicked = (event: any) => {
				switch (event?.data?.menuId) {
					case 'removeSeparationDataFromTeamVersion':
						this.openRemoveConfirmation();
						break;
					case 'settings':
						this.onMenuOptionClick('Settings');
						break;
					case 'markAsReg':
						break;
					default:
						break;
				}
				this.cdr.detectChanges();
			};

			const flyoutXML = '\
				<Menu> \
					<MenuItem Id="markAsReg" Label="Mark as Reg mark" Enabled="true"/> \
					<MenuItem Id="removeSeparationDataFromTeamVersion" Label="Remove separation data from team version" Enabled="true"/> \
					<MenuItem Label="---" /> \
					<MenuItem Id="settings" Label="Settings" Enabled="true"/> \
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
		} catch (err) {

		}
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
				this.documentRefreshKey++;
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
}
