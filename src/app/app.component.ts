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

 constructor(
 private controller: ControllerService,
 private cdr: ChangeDetectorRef
 ) {}

	ngOnInit(): void {
		document.body.classList.add('dark');

		this.waitForSession().then(() => {
			this.registerDocumentActivateListener();

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
 delete (window as any).__LEAP_TAB_NAVIGATION__;
 }

 onTabChange(index: number): void {
 this.activeTab = index;
 this.selectedMenuOption = null;
 }

 onMenuOptionClick(title: string): void {
 this.selectedMenuOption = title;
 this.activeTab = null;
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
			};

			csInterface.addEventListener(EVENT_DOCUMENT_ACTIVATE, handleDocumentActivate);

			this.documentActivateListener = () => {

				if (typeof csInterface.removeEventListener === 'function') {
					csInterface.removeEventListener(EVENT_DOCUMENT_ACTIVATE, handleDocumentActivate);
				}
			};
		} catch (err) {

		}
	}
}
