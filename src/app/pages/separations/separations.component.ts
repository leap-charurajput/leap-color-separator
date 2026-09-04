import {
	ChangeDetectorRef,
	Component,
	Input,
	OnChanges,
	OnDestroy,
	OnInit,
	SimpleChanges
} from '@angular/core';
import { Subscription } from 'rxjs';
import { ConfirmDialogCheckboxOption } from '../../components/confirm-dialog/confirm-dialog.component';
import { SeparationProfileActionDialogResult } from '../../components/separation-profile-action-dialog/separation-profile-action-dialog.component';
import { AddSeparationDialogResult, AddSeparationDialogStyleOption } from '../../components/add-separation-dialog/add-separation-dialog.component';
import { ControllerService } from '../../services/controller.service';
import { DataIssuesService } from '../../services/data-issues.service';
import { GraphicsDataService } from '../../services/graphics-data.service';
import { LeapSepsLogService } from '../../services/leap-seps-log.service';
import { roiLogEvent } from '../../services/roi';

interface Separation {
	id: number;
	profile: string;
	styles: string[];
	colors: string[];
	sepFileName: string;
	isCreated: boolean;
}

interface XmpSeparationGroup {
	profile: string;
	styles: string[];
}

@Component({
	selector: 'app-separations',
	templateUrl: './separations.component.html',
	styleUrls: ['./separations.component.css']
})
export class SeparationsComponent implements OnInit, OnChanges, OnDestroy {
	@Input() documentRefreshKey = 0;

	isRunningInBrowser = false;
	expandedGraphics: Set<string> = new Set();
	graphicOptions: string[] = [];
	isLoadingGraphics = false;
	teamCode = '';
	separations: Separation[] = [];
	isLoadingSeparations = false;
	graphicsData: any[] = [];
	availableColors: string[] = [];
	separationPaths: { [key: string]: string } = {};
	/*
	 * The "Separation file path" pattern from Export Settings (export_settings.json →
	 * separationPreviewFilePath). The separation file's NAME is taken from this pattern's basename;
	 * when it is empty, Generate is disabled and the user is asked to set it first.
	 */
	separationFilePathPattern = '';
	graphicFolderStatus: { [key: string]: boolean } = {};
	graphicFileStatus: { [key: string]: boolean } = {};
	isCheckingFolderMap: { [key: string]: boolean } = {};
	hasVersionDocument = false;
	isCheckingDocument = false;
	/*
	 * Standalone (non-LEAP) jobs recorded on the active document's XMP at Export. Deliberately a
	 * SEPARATE list from `separations` (the LEAP list) so neither flow can affect the other.
	 */
	standaloneJobs: any[] = [];
	hasGraphicsPositions = false;
	isSeparatedDoc = false;
	/** Profile names from Profiles.json (Separation Profile Settings); used to disable Generate when profile file missing. */
	profileNamesFromSettings: string[] = [];
	profileNamesLoaded = false;
	/** Map of profile name (UPPERCASE) -> profile code (from Profiles.json); resolves a separation to its ink-info code. */
	profileNameToCode: { [key: string]: string } = {};
	/** Profile codes / names (UPPERCASE) that have at least one row in profile_ink_exceptions.json. */
	inkInfoProfileCodes = new Set<string>();
	inkInfoProfileNames = new Set<string>();
	/** True once the ink-info presence check has run. */
	inkInfoProfilesLoaded = false;
	/** Current version document path; used to resolve project Batch Excel for style/color codes. */
	versionDocumentPath: string | null = null;
	separatedDocInfo: {
		teamVersionName?: string;
		teamVersionPath?: string;
		leapTemplateName?: string;
		leapTemplatePath?: string;
		profileMetaData?: {
			graphicName?: string;
			createdDate?: string;
			artistName?: string;
			artistInitials?: string;
			styleCodes?: string[];
		};
	} = {};
	/** Show confirmation dialog before deleting all plates */
	showDeleteAllConfirm = false;
	/** Show confirmation before recreating plates (optional cleanup checkboxes) */
	showRecreateAllConfirm = false;
	/** All style codes from team Batch Excel (for New separation dialog). */
	allTeamStyleCodes: string[] = [];
	/** Confirm delete separation .ai file + clear XMP path */
	showDeleteSeparationFileConfirm = false;
	deleteSeparationFileContext: {
		graphicName: string;
		separationId: number;
		profileName: string;
		filePath: string;
	} | null = null;
	/** Duplicate / Edit-New separation dialog */
	separationActionDialogOpen = false;
	separationActionDialogMode: 'duplicate' | 'edit-new' = 'edit-new';
	separationActionDialogIsNew = false;
	separationActionDialogContext: {
		graphicName: string;
		separationId: number;
		originalProfileName: string;
	} | null = null;
	separationActionDialogStyleCodes: string[] = [];
	separationActionDialogInitialProfile = '';
	separationActionDialogInitialStyles: string[] = [];
	separationActionDialogHasFile = false;
	separationActionDialogInitialDuplicateAi = true;
	separationActionDialogInitialScaleEnabled = false;
	separationActionDialogInitialScalePercent: number | null = 100;
	/** Add separation dialog */
	addSeparationDialogOpen = false;
	addSeparationDialogGraphicName = '';
	isLoadingAddSeparationDialog = false;
	styleCatalogOptions: AddSeparationDialogStyleOption[] = [];
	/** Groups read from XMP LEAPSeparationProfileData to persist manual additions across reopen. */
	xmpSeparationGroups: XmpSeparationGroup[] = [];
	// Checked by default so "Recreate All Plates" performs the same full path cleanup
	// as "Create Separations" out of the box. Users can untick to skip cleanup.
	recreatePlateCheckboxOptions: ConfirmDialogCheckboxOption[] = [
		{
			id: 'deleteUnpaintedPaths',
			label: 'Delete unpainted paths after Merge',
			checked: true
		},
		{
			id: 'deleteLeftoverPaths',
			label: 'Delete leftover paths after Add',
			checked: true
		}
	];
	private documentActivateHandler: (() => void) | null = null;
	private graphicsSubscription: Subscription | null = null;

	constructor(
		private controller: ControllerService,
		private cdr: ChangeDetectorRef,
		private graphicsDataService: GraphicsDataService,
		private leapSepsLog: LeapSepsLogService,
		private dataIssues: DataIssuesService
	) {
		this.isRunningInBrowser = !(window as any).__adobe_cep__ && !(window as any).leap;
	}

	/*
	 * Failure surfacing: log + red banner, NO modal alert. Requested after the splitColors debugging
	 * round — a blocking alert interrupts the artist mid-flow, while the banner carries the same
	 * message, stays dismissible, and everything is already in leap_seps.log for us.
	 */
	private reportFailure(id: string, message: string): void {
		this.dataIssues.report(id, message);
	}

	ngOnInit(): void {
		this.setupDocumentEventListener();
		this.checkVersionDocument();
		this.subscribeToGraphicsData();
		this.startSelectionTracking();
	}

	private subscribeToGraphicsData(): void {
		this.graphicsSubscription = this.graphicsDataService.graphicsData$.subscribe((data) => {
			this.graphicsData = data;
			this.hasGraphicsPositions = data.some((g: any) => g.position && g.position.trim() !== '');
			this.cdr.detectChanges();
		});
	}

	ngOnDestroy(): void {
		this.removeDocumentEventListener();
		this.stopSelectionTracking();
		if (this.graphicsSubscription) {
			this.graphicsSubscription.unsubscribe();
		}
	}


	ngOnChanges(changes: SimpleChanges): void {
		if (changes['documentRefreshKey']) {
			this.refreshData();
		}
	}

	/*
	 * Load the "Separation file path" pattern from Export Settings. Kept in sync on each refresh so a
	 * change in Export Settings reflects in the Generate gating without a reload.
	 */
	async loadSeparationFilePathSetting(): Promise<void> {
		if (this.isRunningInBrowser || typeof this.controller.loadExportSettings !== 'function') {
			this.separationFilePathPattern = '';
			return;
		}
		try {
			const res: any = await this.controller.loadExportSettings();
			this.separationFilePathPattern =
				res && res.success && res.data && res.data.separationPreviewFilePath != null
					? String(res.data.separationPreviewFilePath).trim()
					: '';
		} catch (e) {
			this.separationFilePathPattern = '';
		}
		this.cdr.detectChanges();
	}

	/* True when the Separation file path (Export Settings) is not configured — Generate is blocked. */
	get isSeparationFilePathMissing(): boolean {
		return !this.separationFilePathPattern || this.separationFilePathPattern.trim() === '';
	}

	async refreshData(): Promise<void> {
		this.isCheckingDocument = true;
		this.cdr.detectChanges();
		try {
			await this.loadSeparationFilePathSetting();
			await this.checkVersionDocument();
			if (this.hasVersionDocument) {
				await this.loadGraphicsList();
				await this.loadGraphicsData();
				await this.loadSeparationPaths();
				await this.loadTeamCode();
			} else if (!this.isSeparatedDoc) {
				this.graphicOptions = [];
				this.teamCode = '';
				this.separations = [];
				this.graphicsData = [];
				this.separationPaths = {};
				this.hasGraphicsPositions = false;
				this.isSeparatedDoc = false;
				this.cdr.detectChanges();
			}
		} catch (err) {
			console.error('[Separations] refreshData error:', err);
		} finally {
			this.isCheckingDocument = false;
			this.cdr.detectChanges();
		}
	}

	setupDocumentEventListener(): void {
		if (this.isRunningInBrowser || !(window as any).session) {
			return;
		}

		try {
			const csInterface = (window as any).session.scriptLoader().cs;
			const EVENT_DOCUMENT_ACTIVATE = 'documentAfterActivate';

			this.documentActivateHandler = () => {
				this.checkVersionDocument();
				this.loadTeamCode();
				this.loadGraphicsList();
				this.loadGraphicsData();
				this.loadSeparationPaths();
			};

			csInterface.addEventListener(EVENT_DOCUMENT_ACTIVATE, this.documentActivateHandler);
		} catch (err) { }
	}

	removeDocumentEventListener(): void {
		if (this.isRunningInBrowser || !(window as any).session || !this.documentActivateHandler) {
			return;
		}

		try {
			const csInterface = (window as any).session.scriptLoader().cs;
			const EVENT_DOCUMENT_ACTIVATE = 'documentAfterActivate';

			csInterface.removeEventListener(EVENT_DOCUMENT_ACTIVATE, this.documentActivateHandler);
			this.documentActivateHandler = null;
		} catch (err) { }
	}

	/*
	 * ----- NN Pro product mode (docs/TODO.md "NN Pro separation support") -----
	 * An NN Pro PRODUCT behaves like a version document on this tab. Sources differ:
	 * graphic options = colorSepsConfig position artboards, style codes = the player row's
	 * "Lineup Style Code", colors = its "Color Code", teamCode = "Team Org Code".
	 * Everything downstream (profile lookup via Styles.xlsx, GraphicsOrganizationData,
	 * separation groups) is the unchanged LEAP path.
	 */
	isNNProDoc = false;
	private nnProContext: any = null;

	private async detectNNPro(): Promise<boolean> {
		try {
			const context = await this.controller.resolveNNProContext();
			if (!context || !context.isNNProProduct) {
				return false;
			}
			/* No positions config = OLD product → standalone form/jobs path (mirror of the
			   Graphics-tab gating), not the organize mode. */
			const positions = context.colorSepsConfig?.positions;
			const hasPositions =
				Array.isArray(positions) && positions.some((p: any) => p && String(p.artboard || '').trim() !== '');
			if (!hasPositions) {
				return false;
			}
			this.nnProContext = context;
			this.isNNProDoc = true;
			this.hasVersionDocument = true;
			this.versionDocumentPath = context.documentPath || null;
			return true;
		} catch (e) {
			return false;
		}
	}

	/** NN Pro style codes — the player row's "Lineup Style Code", comma/semicolon-split. */
	private nnProStyleCodes(): string[] {
		const raw = this.nnProContext?.playerRow ? this.nnProContext.playerRow['Lineup Style Code'] : null;
		if (raw == null) return [];
		return String(raw)
			.split(/[,;]+/)
			.map((code) => code.trim())
			.filter((code) => code !== '');
	}

	/** NN Pro colorway list — the player row's "Color Code" (may be a NUMBER from Excel). */
	private nnProColorList(): string[] {
		const code = this.nnProContext?.playerRow ? this.nnProContext.playerRow['Color Code'] : null;
		const text = code != null ? String(code).trim() : '';
		return text !== '' ? [text] : [];
	}

	/*
	 * NN Pro Prepare: open the STANDALONE form prefilled from the player row + this profile group.
	 * The user selects the artwork on the product, Exports, and runs Prepare from the form — the
	 * standard standalone flow from there (SEP doc lands in <product folder>/SEPS until the NN Pro
	 * output folder is decided). Position prefills from this graphic's Organize Graphics row.
	 */
	private openStandaloneFormForNNProGroup(separationId: number, graphicName: string): void {
		const separation = this.separations.find((s) => s.id === separationId);
		const row = this.nnProContext?.playerRow || {};
		const text = (key: string): string => (row && row[key] != null ? String(row[key]).trim() : '');
		const graphicEntry = this.graphicsData.find((g: any) => g && g.name === graphicName);
		const job = {
			itemId: text('Item_ID'),
			position: (graphicEntry && graphicEntry.position) || '',
			teamCode: text('Team Org Code'),
			league: text('League_desc'),
			styleCode:
				(separation?.styles && separation.styles[0]) ||
				text('Lineup Style Code').split(/[,;]+/)[0].trim(),
			profileName:
				separation && separation.profile && separation.profile !== 'Unknown Profile'
					? separation.profile
					: '',
			teamName: text('Graphic Org Name'),
			concept: text('Graphic Concept Code'),
			garmentColors: '',
			garmentColorCode: text('Color Code'),
			graphicName: text('Graphic_Name'),
			graphicCode: text('Graphic_code'),
			player: text('Player Full Name'),
			season: text('Style Season'),
			sourceDocumentPath: this.nnProContext?.documentPath || ''
		};
		this.leapSepsLog.logClick('Prepare for Seps (NN Pro -> standalone form)', {
			separationId,
			graphicName,
			profile: job.profileName,
			style: job.styleCode,
			position: job.position
		});
		const nav = (window as any).__LEAP_TAB_NAVIGATION__;
		if (nav && typeof nav.openStandalone === 'function') {
			nav.openStandalone(job);
		} else {
			this.reportFailure('separation-generate', 'Could not open the standalone form for this NN Pro product.');
		}
	}

	async checkVersionDocument(): Promise<void> {
		this.isCheckingDocument = true;
		this.isNNProDoc = false;
		this.nnProContext = null;
		try {
			const separatedResult = await this.controller.checkSeparatedDocument();
			// Debug: share this console output to inspect XMP/document detection
			console.log('[Separations] checkSeparatedDocument result:', JSON.stringify({
				success: separatedResult?.success,
				isSeparatedDoc: separatedResult?.data?.isSeparatedDoc,
				docPath: separatedResult?.data?.docPath,
				docName: separatedResult?.data?.docName,
				_debug: separatedResult?.data?._debug
			}, null, 2));
			if (separatedResult.success && separatedResult.data && separatedResult.data.isSeparatedDoc) {
				this.isSeparatedDoc = true;
				this.separatedDocInfo = { ...(separatedResult.data || {}) };
				this.hasVersionDocument = false;
				this.versionDocumentPath = null;
				this.isCheckingDocument = false;

				// Try to fetch styleInfo if missing from XMP but styleCodes are present
				const meta: any = this.separatedDocInfo.profileMetaData;
				if (meta && !meta.styleInfo && meta.styleCodes && Array.isArray(meta.styleCodes) && meta.styleCodes.length > 0) {
					try {
						const styleRes = await this.controller.getStyleInformation(meta.styleCodes);
						if (styleRes?.success && styleRes.styleInfoMap) {
							const firstCode = meta.styleCodes[0];
							const styleInfo = styleRes.styleInfoMap[firstCode];
							if (styleInfo) {
								meta.styleInfo = styleInfo;
							}
						}
					} catch (e) {
						console.warn('[Separations] Failed to fetch styleInfo for separated doc', e);
					}
				}

				// Debug: full payload received by Separations (should show template/version links and profileMetaData)
				console.log('[Separations] separatedDocInfo set (Current sep UI data):', {
					hasProfileMetaData: !!this.separatedDocInfo.profileMetaData,
					hasStyleInfo: !!(this.separatedDocInfo.profileMetaData as any)?.styleInfo,
					graphicName: (this.separatedDocInfo.profileMetaData as any)?.graphicName,
					artistName: (this.separatedDocInfo.profileMetaData as any)?.artistName,
					artistInitials: (this.separatedDocInfo.profileMetaData as any)?.artistInitials,
					teamVersionName: this.separatedDocInfo.teamVersionName,
					leapTemplateName: this.separatedDocInfo.leapTemplateName,
					willShowRows: !!(
						this.separatedDocInfo.teamVersionName ||
						this.separatedDocInfo.leapTemplateName ||
						((this.separatedDocInfo.profileMetaData as any)?.graphicName || '').trim() ||
						((this.separatedDocInfo.profileMetaData as any)?.artistName || (this.separatedDocInfo.profileMetaData as any)?.artistInitials || '').trim()
					)
				});
				this.cdr.detectChanges();
				await this.loadProfileNamesFromSettings();
				return;
			}
			this.isSeparatedDoc = false;
			this.separatedDocInfo = {};
			const result = await this.controller.getTemplateInfo();
			if (this.isSeparatedDoc || !result) return;
			if (result.success && result.hasDocument) {
				const isVersionFile = result.hasDocument && result.data && result.data.teamCode;
				this.hasVersionDocument = !!isVersionFile;
				this.versionDocumentPath = result.documentPath || null;

				/* Not a LEAP version doc — an NN Pro PRODUCT drives this tab with NN Pro sources. */
				if (!this.hasVersionDocument) {
					await this.detectNNPro();
				}

				/*
				 * Standalone (non-LEAP) jobs recorded on THIS document (at Export, or via the form's
				 * Done). Looked up when the document is not a LEAP version document — and for NN Pro
				 * organize-mode products, whose Done-recorded jobs are what actually run Prepare. The
				 * LEAP path never pays for it and can never be influenced by it.
				 */
				if (!this.hasVersionDocument || this.isNNProDoc) {
					await this.loadStandaloneJobs();
				} else {
					this.standaloneJobs = [];
				}

				if (this.hasVersionDocument) {
					await this.loadVersionDocumentData();
				}
			} else {
				this.hasVersionDocument = false;
				this.versionDocumentPath = null;
				this.graphicOptions = [];
				this.teamCode = '';
				this.separations = [];
				this.graphicsData = [];
				this.separationPaths = {};
				this.hasGraphicsPositions = false;
				/*
				 * getTemplateInfo FAILS for a non-LEAP document ("JSON file not found…") — the NN Pro
				 * product case lands here too (no team JSON next to it), so check NN Pro first.
				 */
				if (await this.detectNNPro()) {
					await this.loadStandaloneJobs();
					await this.loadVersionDocumentData();
				} else {
					/* …and it is also exactly where standalone jobs live. Clearing the list here made the
					   tab fall back to "Please open the version document" straight after an export, so load
					   them in this branch too. */
					await this.loadStandaloneJobs();
				}
			}
		} catch (err) {
			console.error('[Separations] checkVersionDocument error:', err);
			this.hasVersionDocument = false;
		} finally {
			// Debug: final state after check (share this to verify UI state)
			console.log('[Separations] checkVersionDocument state:', {
				isSeparatedDoc: this.isSeparatedDoc,
				hasVersionDocument: this.hasVersionDocument,
				versionDocumentPath: this.versionDocumentPath,
				isCheckingDocument: this.isCheckingDocument,
				separatedDocInfoKeys: this.isSeparatedDoc ? Object.keys(this.separatedDocInfo || {}) : []
			});
			this.isCheckingDocument = false;
			this.cdr.detectChanges();
		}
	}

	/*
	 * Look up the custom UB names array for a profile from the raw Profiles.json. Returns four
	 * entries (UB1-4); empty strings mean "use the default White UB N naming". Matches by profile
	 * code first, then profile name.
	 */
	private async resolveUnderbaseNamesForProfile(profileCode: string, profileName: string): Promise<string[]> {
		const empty = ['', '', '', ''];
		try {
			if (this.isRunningInBrowser || !this.controller.getSeparationProfiles) return empty;
			const result: any = await this.controller.getSeparationProfiles();
			const profiles: any[] = result && result.success && Array.isArray(result.profiles) ? result.profiles : [];
			const code = String(profileCode || '').trim().toLowerCase();
			const name = String(profileName || '').trim().toLowerCase();
			const match = profiles.find((p) => {
				const pc = String((p && (p['Profile Code'] ?? p.profileCode)) || '').trim().toLowerCase();
				const pn = String((p && (p['Profile Name'] ?? p.profileName ?? p.name)) || '').trim().toLowerCase();
				return (!!code && pc === code) || (!!name && pn === name);
			});
			const arr = match && Array.isArray(match.underbaseNames) ? match.underbaseNames : null;
			if (!arr) return empty;
			return [0, 1, 2, 3].map((i) => (arr[i] != null ? String(arr[i]).trim() : ''));
		} catch (_) {
			return empty;
		}
	}

	loadProfileNamesFromSettings(): Promise<void> {
		if (this.isRunningInBrowser || !this.controller.getSeparationProfiles) {
			return Promise.resolve();
		}
		if (!this.hasVersionDocument && !this.isSeparatedDoc) {
			return Promise.resolve();
		}
		return this.controller
			.getSeparationProfiles()
			.then((result: any) => {
				if (result && result.success && Array.isArray(result.profiles)) {
					this.profileNamesFromSettings = (result.profiles as any[])
						.map((p: any) => {
							const name = p && (p['Profile Name'] ?? p.profileName ?? p.name) != null
								? String(p['Profile Name'] ?? p.profileName ?? p.name).trim()
								: '';
							return name;
						})
						.filter(Boolean);
					/* Build a profile name (UPPERCASE) -> code map so a separation can be matched to its ink-info code. */
					const nameToCode: { [key: string]: string } = {};
					for (const p of result.profiles as any[]) {
						const nm = String((p && (p['Profile Name'] ?? p.profileName ?? p.name)) || '').trim();
						const cd = String((p && (p['Profile Code'] ?? p.profileCode)) || '').trim();
						if (nm) nameToCode[nm.toUpperCase()] = cd;
					}
					this.profileNameToCode = nameToCode;
				} else {
					this.profileNamesFromSettings = [];
					this.profileNameToCode = {};
				}
				this.profileNamesLoaded = true;
				this.cdr.detectChanges();
			})
			.catch((err) => {
				this.profileNamesFromSettings = [];
				this.profileNamesLoaded = true;
				this.cdr.detectChanges();
			});
	}

	/**
	 * Load which profiles have ink information in profile_ink_exceptions.json, so the Separations page can
	 * warn (and disable Generate) when a profile's inks have not been imported. Runs AFTER
	 * loadProfileNamesFromSettings (it relies on the name -> code map).
	 */
	loadInkInfoProfileCodes(): Promise<void> {
		if (this.isRunningInBrowser || !this.controller.getInkExceptionProfileCodes) {
			this.inkInfoProfilesLoaded = true;
			return Promise.resolve();
		}
		return this.controller
			.getInkExceptionProfileCodes()
			.then((result: any) => {
				const codes = result && result.success && Array.isArray(result.profileCodes) ? result.profileCodes : [];
				const names = result && result.success && Array.isArray(result.profileNames) ? result.profileNames : [];
				this.inkInfoProfileCodes = new Set<string>(
					codes.map((c: any) => String(c || '').trim().toUpperCase()).filter(Boolean)
				);
				this.inkInfoProfileNames = new Set<string>(
					names.map((n: any) => String(n || '').trim().toUpperCase()).filter(Boolean)
				);
				this.inkInfoProfilesLoaded = true;
				this.cdr.detectChanges();
			})
			.catch(() => {
				this.inkInfoProfileCodes = new Set<string>();
				this.inkInfoProfileNames = new Set<string>();
				this.inkInfoProfilesLoaded = true;
				this.cdr.detectChanges();
			});
	}

	/* The full load chain for a workable document (LEAP version doc or NN Pro product). */
	private async loadVersionDocumentData(): Promise<void> {
		await this.loadProfileNamesFromSettings();
		await this.loadInkInfoProfileCodes();
		await this.loadGraphicsList();
		await this.loadGraphicsData();
		await this.loadSeparationPaths();
		await this.loadTeamCode();
	}

	async loadTeamCode(): Promise<void> {
		if (this.isNNProDoc) {
			/* NN Pro: teamCode = the player row's "Team Org Code"; document path is already set. */
			const row = this.nnProContext?.playerRow;
			this.teamCode = row && row['Team Org Code'] != null ? String(row['Team Org Code']) : '';
			await this.loadAvailableColors();
			await this.loadSeparations();
			return;
		}
		try {
			const result = await this.controller.getTemplateInfo();
			if (result.success && result.data && result.data.teamCode) {
				this.teamCode = result.data.teamCode;
				if (result.documentPath) {
					this.versionDocumentPath = result.documentPath;
				}
				if (this.teamCode && this.teamCode !== '') {
					await this.loadAvailableColors();
					await this.loadSeparations();
				}
			} else {
				this.teamCode = '';
				this.separations = [];
				this.cdr.detectChanges();
			}
		} catch (err) {
			console.error('[Separations] loadTeamCode error:', err);
		}
	}

	async loadAvailableColors(): Promise<void> {
		if (this.isNNProDoc) {
			/* NN Pro: the product carries ONE colorway — the player row's "Color Code". */
			this.availableColors = this.nnProColorList();
			return;
		}
		if (!this.teamCode || this.teamCode === '') {
			return;
		}

		if (this.isRunningInBrowser) {
			return;
		}

		try {
			const result = await this.controller.getColorCodesFromExcel(this.teamCode, this.versionDocumentPath || undefined);
			if (result.success && result.colors && Array.isArray(result.colors)) {
				this.availableColors = result.colors;
			} else {
				this.availableColors = [];
			}
		} catch (err) {
			console.error('[Separations] loadAvailableColors error:', err);
			this.availableColors = [];
		}
	}

	async loadGraphicsList(): Promise<void> {
		if (this.isRunningInBrowser) {
			return;
		}

		if (this.isNNProDoc) {
			/*
			 * NN Pro: graphics = colorSepsConfig position ARTBOARDS (same names the Graphics tab
			 * rows use). No LIVE_ART layers and no 02 GRAPHICS folders to check.
			 */
			const positions = this.nnProContext?.colorSepsConfig?.positions;
			this.graphicOptions = Array.isArray(positions)
				? positions
					.filter((p: any) => p && String(p.artboard || '').trim() !== '')
					.map((p: any) => String(p.artboard).trim())
				: [];
			this.expandedGraphics.clear();
			this.graphicOptions.forEach((g) => this.expandedGraphics.add(g));
			await this.loadSeparationPaths();
			await this.checkGraphicsPositions();
			this.cdr.detectChanges();
			return;
		}

		this.isLoadingGraphics = true;
		try {
			const result = await this.controller.getGraphicsList();
			if (result.success && result.graphics && Array.isArray(result.graphics)) {
				this.graphicOptions = [...result.graphics];

				// Initialize expanded state for all graphics
				this.expandedGraphics.clear();
				this.graphicOptions.forEach((g) => this.expandedGraphics.add(g));

				await this.checkAllGraphicFolders();
				await this.loadSeparationPaths();

				if (this.teamCode && this.teamCode !== '' && this.versionDocumentPath) {
					await this.loadSeparations();
				}

				await this.checkGraphicsPositions();
				this.cdr.detectChanges();
			} else {
				this.graphicOptions = [];
				this.hasGraphicsPositions = false;
			}
		} catch (err) {
			console.error('[Separations] loadGraphicsList error:', err);
			this.graphicOptions = [];
			this.hasGraphicsPositions = false;
		} finally {
			this.isLoadingGraphics = false;
			this.cdr.detectChanges();
		}
	}

	async loadSeparationPaths(skipRefreshSeparations: boolean = false): Promise<void> {
		try {
			const result = await this.controller.loadSeparationPaths();
			if (!result) {
				this.separationPaths = {};
				return;
			}

			if (result.success && result.separationPaths) {
				this.separationPaths = result.separationPaths;
				const entries = Array.isArray(result.separationEntries) ? result.separationEntries : [];
				const grouped: { [profile: string]: Set<string> } = {};
				entries.forEach((entry: any) => {
					const profile = String(entry?.profileName || '').trim();
					if (!profile) return;
					const styles = Array.isArray(entry?.styleCodes)
						? entry.styleCodes.map((s: any) => String(s || '').trim()).filter(Boolean)
						: [];
					if (!grouped[profile]) grouped[profile] = new Set<string>();
					styles.forEach((s: string) => grouped[profile].add(s));
				});
				this.xmpSeparationGroups = Object.keys(grouped).map((profile) => ({
					profile,
					styles: Array.from(grouped[profile]).sort()
				}));
				if (!skipRefreshSeparations && this.hasVersionDocument && this.teamCode) {
					this.loadSeparations();
				}
			} else {
				this.separationPaths = {};
				this.xmpSeparationGroups = [];
			}
		} catch (err) {
			console.error('[Separations] loadSeparationPaths error:', err);
			this.separationPaths = {};
			this.xmpSeparationGroups = [];
		} finally {
			this.cdr.detectChanges();
		}
	}

	async loadGraphicsData(): Promise<void> {
		try {
			const result = await this.controller.loadGraphicsData();
			if (
				result.success &&
				result.graphicsData &&
				Array.isArray(result.graphicsData) &&
				result.graphicsData.length > 0
			) {
				this.graphicsData = result.graphicsData;
			} else {
				this.loadGraphicsDataFromLocalStorage();
			}
		} catch (err) {
			this.loadGraphicsDataFromLocalStorage();
		} finally {
			this.cdr.detectChanges();
		}
	}

	private loadGraphicsDataFromLocalStorage(): void {
		try {
			const savedGraphics = localStorage.getItem('graphicsPositions');
			if (savedGraphics) {
				this.graphicsData = JSON.parse(savedGraphics);
			} else {
				this.graphicsData = [];
			}
		} catch (err) {
			this.graphicsData = [];
		}
	}

	async checkGraphicsPositions(): Promise<void> {
		try {
			const result = await this.controller.loadGraphicsData();
			if (
				result.success &&
				result.graphicsData &&
				Array.isArray(result.graphicsData) &&
				result.graphicsData.length > 0
			) {
				const graphicsData = result.graphicsData;
				this.hasGraphicsPositions = graphicsData.some((g: any) => g.position && g.position.trim() !== '');
			} else {
				this.checkGraphicsPositionsFromLocalStorage();
			}
		} catch (err) {
			this.checkGraphicsPositionsFromLocalStorage();
		} finally {
			this.cdr.detectChanges();
		}
	}

	private checkGraphicsPositionsFromLocalStorage(): void {
		try {
			const savedGraphics = localStorage.getItem('graphicsPositions');
			if (savedGraphics) {
				const graphicsData = JSON.parse(savedGraphics);
				this.hasGraphicsPositions = graphicsData.some((g: any) => g.position && g.position.trim() !== '');
			} else {
				this.hasGraphicsPositions = false;
			}
		} catch (err) {
			this.hasGraphicsPositions = false;
		}
	}

	private upsertSeparationGroupInList(
		list: Separation[],
		profileName: string,
		styleCode: string
	): Separation[] {
		const normalizedProfile = String(profileName || '').trim() || 'Unknown Profile';
		const normalizedStyle = String(styleCode || '').trim();
		if (!normalizedStyle) return list;
		const existingIndex = list.findIndex((s) => String(s.profile || '').trim() === normalizedProfile);
		if (existingIndex >= 0) {
			return list.map((item, idx) => {
				if (idx !== existingIndex) return item;
				const nextStyles = Array.from(new Set([...(item.styles || []), normalizedStyle])).sort();
				return { ...item, styles: nextStyles };
			});
		}
		const nextId = list.length === 0 ? 1 : Math.max(...list.map((s) => s.id || 0)) + 1;
		return [
			...list,
			{
				id: nextId,
				profile: normalizedProfile,
				styles: [normalizedStyle],
				colors: [],
				sepFileName: '',
				isCreated: false
			}
		];
	}

	private mergeSeparationGroups(base: Separation[], groups: XmpSeparationGroup[]): Separation[] {
		let merged = [...(base || [])];
		(groups || []).forEach((group) => {
			const profile = String(group?.profile || '').trim();
			const styles = Array.isArray(group?.styles) ? group.styles : [];
			styles.forEach((styleCode) => {
				merged = this.upsertSeparationGroupInList(merged, profile, styleCode);
			});
		});
		return merged;
	}

	/*
	 * Standalone (non-LEAP) jobs recorded on the active document's XMP at Export
	 * (`LEAPStandaloneJobs`, written by writeStandaloneJobToXmp).
	 *
	 * A source document can hold SEVERAL jobs — one per selection/position the user exported — so they
	 * are listed one row per job, mirroring how the LEAP tab lists a row per graphic position. Newest
	 * last, as recorded.
	 *
	 * Entirely separate from `separations` (the LEAP list, driven by teamCode + Styles.xlsx): keeping
	 * the two lists apart is what guarantees a standalone document cannot alter LEAP behaviour, and vice
	 * versa. Best-effort — an older host build without the handler simply yields no rows.
	 */
	private async loadStandaloneJobs(): Promise<void> {
		this.standaloneJobs = [];
		try {
			if (this.isRunningInBrowser || typeof this.controller.readStandaloneJobsFromXmp !== 'function') {
				return;
			}
			const res: any = await this.controller.readStandaloneJobsFromXmp();
			if (res && res.success && Array.isArray(res.jobs)) {
				this.standaloneJobs = res.jobs.filter((j: any) => j && typeof j === 'object');
			}
		} catch (err) {
			console.warn('[Separations] Could not read standalone jobs from XMP:', err);
			this.standaloneJobs = [];
		}
	}

	/*
	 * Generate the separation for a recorded standalone job. Opens the standalone form modal
	 * pre-filled from the job (the artwork was already exported when the job was created, so only
	 * Generate remains). Routed through the shell hook so the generate pipeline stays in ONE place
	 * rather than being duplicated here.
	 */
	/*
	 * The standalone job the Add Separation dialog was opened for; null when the dialog belongs to the
	 * LEAP flow. Set so confirmAddSeparationDialog can branch without duplicating the whole handler.
	 */
	private addSeparationStandaloneJob: any = null;

	/*
	 * Add Separation for a standalone job: the SAME exported .ai separated under another profile/style.
	 * Reuses the LEAP dialog — only the persistence differs (a new LEAPStandaloneJobs entry rather than
	 * a LEAPSeparationProfileData row).
	 */
	async handleAddStandaloneSeparation(job: any): Promise<void> {
		if (!job) return;
		/*
		 * Open FIRST, load the style catalogue after.
		 *
		 * ensureStyleCatalogOptionsLoaded() was awaited before opening, so anything it threw — or its
		 * fallback path, which needs a teamCode that a non-LEAP document does not have — left the dialog
		 * unopened and the click looking dead. The catalogue only populates a picker inside the dialog, so
		 * it is not a precondition for showing it.
		 */
		this.addSeparationStandaloneJob = job;
		this.addSeparationDialogGraphicName = this.getStandaloneJobTitle(job);
		this.addSeparationDialogOpen = true;
		this.cdr.detectChanges();
		try {
			await this.ensureStyleCatalogOptionsLoaded();
		} catch (err) {
			console.warn('[Separations] Style catalog load failed for standalone Add Separation:', err);
		} finally {
			/* Never leave the dialog stuck in its loading state if the loader bailed early. */
			this.isLoadingAddSeparationDialog = false;
			this.cdr.detectChanges();
		}
	}

	/* Two-stage for standalone rows — same buttons as the LEAP rows. */
	prepareStandaloneJob(job: any): void {
		const hook = (window as any).__LEAP_STANDALONE__;
		if (hook && typeof hook.openWithJob === 'function') {
			hook.openWithJob({ ...job, autoStage: 'prepare' });
		}
	}

	generateStandaloneJob(job: any): void {
		const hook = (window as any).__LEAP_STANDALONE__;
		if (hook && typeof hook.openWithJob === 'function') {
			/*
			 * Run the stage immediately rather than showing the form. The form component stays mounted
			 * (tab contents are kept alive), so this needs no tab switch.
			 * LEGACY single-shot (autoGenerate: true) is intentionally no longer sent — Generate requires
			 * Prepare first; the form still honours autoGenerate if something else sends it.
			 */
			hook.openWithJob({ ...job, autoStage: 'generate' });
		}
	}

	/*
	 * Standalone jobs grouped by exported GRAPHIC, mirroring the LEAP list's shape: a graphic section
	 * header (carrying one "Add Separation..." link) with its profile rows underneath. Grouping by
	 * exportedFilePath because that is the graphic — several jobs can share one exported .ai when the
	 * same artwork is separated under more than one profile.
	 */
	get standaloneJobGroups(): Array<{ key: string; title: string; jobs: any[] }> {
		const groups: Array<{ key: string; title: string; jobs: any[] }> = [];
		const byKey: { [key: string]: { key: string; title: string; jobs: any[] } } = {};
		for (const job of this.standaloneJobs) {
			const key = String((job && job.exportedFilePath) || (job && job.position) || '').trim() || '(unknown)';
			if (!byKey[key]) {
				byKey[key] = {
					key,
					title: String((job && job.exportedFileName) || this.getStandaloneJobTitle(job) || 'Graphic'),
					jobs: []
				};
				groups.push(byKey[key]);
			}
			byKey[key].jobs.push(job);
		}
		return groups;
	}

	/** Row label for a standalone job: the position is its identity, as in the LEAP flow. */
	getStandaloneJobTitle(job: any): string {
		const pos = (job && job.position ? String(job.position) : '').trim();
		return pos || (job && job.exportedFileName ? String(job.exportedFileName) : 'Standalone graphic');
	}

	/*
	 * Garment colour CODES for the row's "Colors:" line — the same thing the LEAP list shows there
	 * (getGraphicColors returns codes, e.g. "127A", not ink names).
	 *
	 * A standalone job stores them in `garmentColors`, taken from the LICENSING sheet's "Color" field,
	 * which carries codes ("0484, 0042"). Falls back to the single resolved garmentColorCode.
	 * NOTE this is deliberately NOT `job.colors` — those are the decoration INK names extracted from the
	 * artwork (e.g. "PANTONE 1235 C"), which is a different thing and belongs to the plate list.
	 */
	getStandaloneJobColors(job: any): string[] {
		if (!job) return [];
		const raw = job.garmentColors != null ? String(job.garmentColors).trim() : '';
		if (raw) {
			return raw
				.split(/[,/]+/)
				.map((c: string) => c.trim())
				.filter((c: string) => c.length > 0);
		}
		const single = job.garmentColorCode != null ? String(job.garmentColorCode).trim() : '';
		return single ? [single] : [];
	}

	private buildSeparationsFromXmpGroups(): Separation[] {
		const fallbackList = this.mergeSeparationGroups([], this.xmpSeparationGroups);
		return fallbackList.map((item, index) => ({
			...item,
			id: index + 1
		}));
	}

	loadSeparations(): void {
		const logPrefix = '[Separations] Profile generation:';
		if (this.isRunningInBrowser) {
			return;
		}

		/* Refresh the per-document suppression list; re-filter in place when it arrives. */
		this.controller.getSuppressedSeparationProfiles().then((profiles) => {
			this.suppressedProfiles = profiles || [];
			if (this.suppressedProfiles.length && this.separations.length) {
				this.separations = this.filterSuppressedGroups(this.separations);
				this.cdr.detectChanges();
			}
		});

		if (!this.isNNProDoc && (!this.teamCode || this.teamCode === '')) {
			console.log(logPrefix, 'Skipped – missing teamCode:', this.teamCode || '(empty)');
			this.separations = this.filterSuppressedGroups(this.buildSeparationsFromXmpGroups());
			this.allTeamStyleCodes = [];
			if (this.separations.length > 0) {
				console.log(logPrefix, 'Fallback – using XMP separation groups only:', this.separations);
			}
			this.cdr.detectChanges();
			return;
		}

		console.log(logPrefix, 'Inputs – teamCode:', this.teamCode, '| versionDocumentPath:', this.versionDocumentPath, this.isNNProDoc ? '| NN Pro (style codes from player row)' : '');
		this.isLoadingSeparations = true;

		/* NN Pro: style codes come straight from the product's player row, not the BATCH excel.
		   The rest of the chain (Styles.xlsx profile lookup, grouping, XMP merge) is unchanged. */
		const styleCodesSource: Promise<any> = this.isNNProDoc
			? Promise.resolve({ success: true, styleCodes: this.nnProStyleCodes() })
			: this.controller.getStyleCodesFromExcel(this.teamCode, this.versionDocumentPath || undefined);

		styleCodesSource
			.then((styleResult) => {
				if (!styleResult.success || !styleResult.styleCodes || styleResult.styleCodes.length === 0) {
					console.warn(logPrefix, 'Step 1 – Style codes: missing or failed. success:', styleResult?.success, '| count:', styleResult?.styleCodes?.length ?? 0, '| error:', styleResult?.error ?? 'none');
					this.separations = this.buildSeparationsFromXmpGroups();
					this.allTeamStyleCodes = [];
					if (this.separations.length > 0) {
						console.log(logPrefix, 'Fallback – rendering XMP separation groups because style codes are unavailable:', this.separations);
					}
					// Keep existing Styles.xlsx catalog for Add Separation search.
					this.isLoadingSeparations = false;
					this.cdr.detectChanges();
					return;
				}

				const styleCodes = styleResult.styleCodes;
				this.allTeamStyleCodes = [...styleCodes];
				console.log(logPrefix, 'Step 1 – Style codes from Excel:', styleCodes.length, 'codes:', styleCodes);

				return this.controller.getProfileNamesFromExcel(styleCodes).then((profileResult) => {
					if (!profileResult.success || !profileResult.profileMap) {
						console.warn(logPrefix, 'Step 2 – Profile names: missing or failed. success:', profileResult?.success, '| error:', profileResult?.error ?? 'none');
						this.separations = this.buildSeparationsFromXmpGroups();
						// Keep style search usable in Add Separation even when profile mapping fails.
						this.styleCatalogOptions = styleCodes.map((styleCode: string) => ({
							styleCode: String(styleCode || '').trim(),
							profileName: 'Unknown Profile'
						}));
						if (this.separations.length > 0) {
							console.log(logPrefix, 'Fallback – rendering XMP separation groups because profile mapping is unavailable:', this.separations);
						}
						this.isLoadingSeparations = false;
						this.cdr.detectChanges();
						return;
					}

					const profileMap = profileResult.profileMap;
					/* TEAMOUT-SCOPE PERSISTENCE — parked, see docs/TODO.md.
					this.applyTeamoutOverrides(profileMap, styleCodes);
					*/
					this.styleCatalogOptions = styleCodes.map((styleCode: string) => ({
						styleCode: String(styleCode || '').trim(),
						profileName: String(profileMap[styleCode] || 'Unknown Profile').trim()
					}));
					const styleCodesWithProfile: string[] = [];
					const styleCodesMissingProfile: string[] = [];
					styleCodes.forEach((sc: string) => {
						const name = profileMap[sc];
						if (name && name !== 'Unknown Profile') {
							styleCodesWithProfile.push(sc);
						} else {
							styleCodesMissingProfile.push(sc);
						}
					});
					console.log(logPrefix, 'Step 2 – Profile map from Styles.xlsx: found for', styleCodesWithProfile.length, 'style codes:', Object.fromEntries(styleCodesWithProfile.map((sc) => [sc, profileMap[sc]])));
					if (styleCodesMissingProfile.length > 0) {
						console.warn(logPrefix, 'Step 2 – Style codes with no profile (will show as "Unknown Profile"):', styleCodesMissingProfile);
					}

					const profileGroups: { [key: string]: string[] } = {};
					styleCodes.forEach((styleCode: string) => {
						const profileName = profileMap[styleCode] || 'Unknown Profile';
						if (!profileGroups[profileName]) {
							profileGroups[profileName] = [];
						}
						profileGroups[profileName].push(styleCode);
					});
					console.log(logPrefix, 'Step 3 – Profile groups (profile → style codes):', profileGroups);

					const separationsList = Object.keys(profileGroups).map((profileName, index) => ({
						id: index + 1,
						profile: profileName,
						styles: profileGroups[profileName].sort(),
						colors: [],
						sepFileName: '',
						isCreated: false
					}));

					console.log(logPrefix, 'Step 4 – Generated separations:', separationsList.length, 'profiles:', separationsList.map((s) => ({ id: s.id, profile: s.profile, styles: s.styles })));
					this.separations = this.filterSuppressedGroups(
						this.mergeSeparationGroups(separationsList, this.xmpSeparationGroups)
					);
					this.isLoadingSeparations = false;
					this.cdr.detectChanges();
				});
			})
			.catch((err) => {
				console.error(logPrefix, 'Error loading separations:', err);
				this.separations = this.buildSeparationsFromXmpGroups();
				this.allTeamStyleCodes = [];
				if (this.separations.length > 0) {
					console.log(logPrefix, 'Fallback – rendering XMP separation groups after error:', this.separations);
				}
				// Keep existing Styles.xlsx catalog for Add Separation search.
				this.isLoadingSeparations = false;
				this.cdr.detectChanges();
			});
	}

	getGraphicColors(graphicName: string): string[] {
		if (!graphicName || this.graphicsData.length === 0) {
			return [];
		}
		const graphic = this.graphicsData.find((g: any) => g.name === graphicName);
		if (graphic && graphic.colors !== undefined) {
			if (graphic.colors === null) {
				return this.availableColors;
			}
			if (graphic.colors.length === 0) {
				return [];
			}
			return graphic.colors;
		}
		return [];
	}

	/** Distress flag from Organize Graphics (drives Profiles.json Distress Y/N lookup). */
	private getGraphicDistress(graphicName: string): boolean {
		const graphic = this.graphicsData.find((g: any) => g && g.name === graphicName);
		return !!(graphic && graphic.distress);
	}

	/* ----- Two-stage button state (see runSeparationStage) ----- */

	/*
	 * Illustrator selection state, so the Prepare button can read "Prepare for Seps from Selection"
	 * while something is selected. EVENT-DRIVEN via AIEvent.ART_SELECTION_CHANGED (same
	 * AIEventAdapter pattern as the Plates tab's swatch-change listener); the Graphics-tab 700ms
	 * poll remains only as the fallback when the host adapter is unavailable. Either way the label
	 * is cosmetic — the flag actually sent to the host is re-checked fresh at click time.
	 */
	hasIllustratorSelection = false;
	private selectionPollInterval: any = null;
	private selectionEventAdapter: any = null;
	private selectionEventHandler: ((evt: any) => void) | null = null;
	private selectionEventType: string | null = null;
	private selectionRefreshDebounce: any = null;

	private startSelectionTracking(): void {
		if (this.isRunningInBrowser) return;
		if (this.registerArtSelectionChangedListener()) {
			this.refreshSelectionState();
			return;
		}
		this.startSelectionPolling();
	}

	private registerArtSelectionChangedListener(): boolean {
		try {
			/* Same dual lookup as the Plates tab's swatch listener: the adapter script may land as a
			   bare global rather than a window property depending on bundle evaluation. */
			const resolveGlobal = (name: string): any => {
				const w = window as any;
				if (w[name]) { return w[name]; }
				try {
					// eslint-disable-next-line no-new-func
					const v = Function('try{return typeof ' + name + '!=="undefined"?' + name + ':undefined}catch(e){return undefined}')();
					return v || undefined;
				} catch (e) {
					return undefined;
				}
			};
			const AIEventAdapterRef = resolveGlobal('AIEventAdapter');
			const AIEventRef = resolveGlobal('AIEvent');
			if (
				!AIEventAdapterRef ||
				!AIEventRef ||
				typeof AIEventAdapterRef.getInstance !== 'function' ||
				!AIEventRef.ART_SELECTION_CHANGED
			) {
				console.warn('[SEPARATIONS] AIEventAdapter unavailable; falling back to selection polling');
				return false;
			}
			const handler = (_evt: any) => {
				/* Marquee drags / multi-selects fire in bursts — collapse them into one count query. */
				if (this.selectionRefreshDebounce) {
					clearTimeout(this.selectionRefreshDebounce);
				}
				this.selectionRefreshDebounce = setTimeout(() => this.refreshSelectionState(), 150);
			};
			const adapter = AIEventAdapterRef.getInstance();
			adapter.addEventListener(AIEventRef.ART_SELECTION_CHANGED, handler);
			this.selectionEventAdapter = adapter;
			this.selectionEventHandler = handler;
			this.selectionEventType = AIEventRef.ART_SELECTION_CHANGED;
			console.log('[SEPARATIONS] Subscribed to art selection event:', this.selectionEventType);
			return true;
		} catch (err) {
			console.warn('[SEPARATIONS] Failed to subscribe to art selection event:', err);
			return false;
		}
	}

	private stopSelectionTracking(): void {
		try {
			if (
				this.selectionEventAdapter &&
				this.selectionEventHandler &&
				this.selectionEventType &&
				typeof this.selectionEventAdapter.removeEventListener === 'function'
			) {
				this.selectionEventAdapter.removeEventListener(this.selectionEventType, this.selectionEventHandler);
			}
		} catch (e) {
			/* no-op */
		}
		this.selectionEventAdapter = null;
		this.selectionEventHandler = null;
		this.selectionEventType = null;
		if (this.selectionRefreshDebounce) {
			clearTimeout(this.selectionRefreshDebounce);
			this.selectionRefreshDebounce = null;
		}
		this.stopSelectionPolling();
	}

	private startSelectionPolling(): void {
		if (this.isRunningInBrowser || this.selectionPollInterval) return;
		this.refreshSelectionState();
		this.selectionPollInterval = setInterval(() => this.refreshSelectionState(), 700);
	}

	private stopSelectionPolling(): void {
		if (this.selectionPollInterval) {
			clearInterval(this.selectionPollInterval);
			this.selectionPollInterval = null;
		}
	}

	private refreshSelectionState(): void {
		this.controller
			.getSelectionCount()
			.catch(() => 0)
			.then((count) => {
				const has = count > 0;
				if (has !== this.hasIllustratorSelection) {
					this.hasIllustratorSelection = has;
					this.cdr.detectChanges();
				}
			});
	}

	/** "preparedForSeps" | "separated" | "" for the ACTIVE document, from checkSeparatedDocument. */
	get separationStatus(): string {
		return String((this.separatedDocInfo as any)?.separationStatus || '');
	}

	/** Active document is a SEP doc that was prepared but not yet generated. */
	get isPreparedSepDoc(): boolean {
		return this.isSeparatedDoc && this.separationStatus === 'preparedForSeps';
	}

	/** Graphic recorded at Prepare — what Generate will run on. */
	get preparedGraphicName(): string {
		const ctx = (this.separatedDocInfo as any)?.preparedContext;
		return ctx && ctx.graphicName ? String(ctx.graphicName) : '';
	}

	/**
	 * Generate from the prepared SEP document (it is the active document; no separation row context
	 * is needed — the host reads everything back from the document's XMP).
	 */
	handleGenerateFromPreparedDoc(): void {
		const graphicName = this.preparedGraphicName;
		if (!graphicName) {
			this.reportFailure('separation-generate', 'Prepared graphic not recorded on this document — run Prepare for Seps again.');
			return;
		}
		this.leapSepsLog.logClick('Generate separation (from prepared)', { graphicName });
		const meta: any = (this.separatedDocInfo as any)?.profileMetaData || null;
		const styleCodes: string[] = meta && Array.isArray(meta.styleCodes) ? meta.styleCodes : [];
		const ctx: any = (this.separatedDocInfo as any)?.preparedContext || {};
		/*
		 * Standalone (Non-LEAP) prepared docs are generated by the standalone host script; LEAP ones by
		 * handleGenerateFromPrepared. Both read their context from the SEP document's XMP.
		 */
		const run: Promise<any> = ctx.standalone
			? this.controller.generateStandaloneSeparation({
				graphicName,
				styleCodes,
				profileMetadata: meta,
				jsonData: {},
				exportedFilePath: String(ctx.exportedFilePath || ''),
				stage: 'generate'
			})
			: this.controller.generateFromPrepared(graphicName, styleCodes, meta);
		run
			.then((result: any) => {
				if (result?.success) {
					this.dataIssues.clear('separation-generate');
					const tabNavigation = (window as any).__LEAP_TAB_NAVIGATION__;
					if (tabNavigation && typeof tabNavigation.navigateToTab === 'function') {
						tabNavigation.navigateToTab(2);
						setTimeout(() => {
							if ((window as any).__LEAP_SEPARATION_COLORS_REFRESH__) {
								(window as any).__LEAP_SEPARATION_COLORS_REFRESH__();
							}
						}, 500);
					}
					this.refreshData();
				} else {
					const message = result?.error || 'Generate failed. See today\'s log in Documents/LEAP Settings/Logs/LEAP_Seps.';
					this.leapSepsLog.logError('Separations', message, result);
					this.reportFailure('separation-generate', message);
				}
			})
			.catch((err: any) => {
				this.leapSepsLog.logError('Separations', err);
				this.reportFailure('separation-generate', err?.message || String(err));
			});
	}

	/*
	 * Fill the prepared SEP document's printed PG Ink table + GRID INFO BOX from what the profile
	 * already tells us — DOCUMENT-ONLY preview so the sheet does not sit full of [Token]s and empty
	 * rows between Prepare and Generate. The Plates tab stays "not generated yet", and Generate
	 * rewrites this table from the REAL plates (sequence, edits, renames — all final there).
	 *
	 * First pass is deliberately simple: the enabled White UB passes on top (pass 1, 2, 3… — the same
	 * print order the Plates tab shows), then one row per graphic ink (profile colorMesh + flags).
	 * UB rows use profile meshes and custom names when the profile has them. NO second-hit rows —
	 * an "X 2" swatch with no plate behind it raises "ye swatch kahan se aaya" instead of helping.
	 *
	 * Best-effort: a prefill failure must never fail the Prepare (log only).
	 */
	private async prefillSepTableAfterPrepare(profileInfo: any, profileMetadata: any): Promise<void> {
		try {
			if (this.isRunningInBrowser) return;
			/*
			 * INKS COME FROM THE PREPARED DOCUMENT'S SPOT SWATCHES — the pasted live art brings its ink
			 * spots into the SEP doc. The first version used getGraphicColors(), which returns GARMENT
			 * colorway codes ("00A"/"127A"), and the grid promptly reported
			 * "Swatch '00A' not found for group '1'". Template spots that are not inks are filtered:
			 * [Registration]-style bracket names, GARMENT, every White-UB variant (incl. custom names),
			 * Choke and Blocker.
			 */
			const allSpots = await this.controller.getSpotColorSwatches();
			const inks = (allSpots || [])
				.map((c) => String(c || '').trim())
				.filter((name) =>
					!!name &&
					!name.startsWith('[') &&
					name.toUpperCase() !== 'GARMENT' &&
					!/white\s*ub/i.test(name) &&
					name.toUpperCase() !== 'CHOKE' &&
					name.toUpperCase() !== 'BLOCKER'
				);
			if (inks.length === 0) {
				console.log('[SEPARATIONS] prefill skipped - no ink spot swatches in the prepared document');
				return;
			}
			const colorMesh = profileInfo?.colorMesh != null && String(profileInfo.colorMesh).trim() !== ''
				? String(profileInfo.colorMesh)
				: '110';
			const micron = profileInfo?.micron != null && String(profileInfo.micron).trim() !== ''
				? String(profileInfo.micron)
				: 'NA';
			const flash = !!profileInfo?.flash;
			const cool = !!profileInfo?.cool;
			const wb = !!profileInfo?.wb;

			/*
			 * White UB passes FIRST, ascending (pass 1, 2, 3…) — the Plates tab prints Blocker →
			 * White UBs → inks (sortColorRowsWithWhiteUBAtBottom), so the prefilled table shows the
			 * same order the plates will.
			 */
			const rows: any[] = [];
			const enabled: boolean[] = Array.isArray(profileMetadata?.underbaseEnabled)
				? profileMetadata.underbaseEnabled
				: [true, false, false, false];
			const meshes: string[] = Array.isArray(profileMetadata?.underbaseMeshes)
				? profileMetadata.underbaseMeshes
				: [];
			const names: string[] = Array.isArray(profileMetadata?.underbaseNames)
				? profileMetadata.underbaseNames
				: [];
			for (let pass = 0; pass < enabled.length; pass++) {
				if (!enabled[pass]) continue;
				const name = String(names[pass] || '').trim() || (pass === 0 ? 'White UB' : 'White UB ' + (pass + 1));
				rows.push({
					colorName: name,
					swatchName: name,
					mesh: String(meshes[pass] || '').trim() || colorMesh,
					micron,
					flash,
					cool,
					wb,
					hex: null,
					type: 'separation'
				});
			}

			for (const ink of inks) {
				rows.push({
					colorName: ink,
					swatchName: ink,
					mesh: colorMesh,
					micron,
					flash,
					cool,
					wb,
					hex: null,
					type: 'separation'
				});
			}

			const separationData = rows.map((row, index) => ({ seq: index + 1, ...row }));
			this.controller
				.updateSepTable(separationData)
				.then((res: any) => {
					this.leapSepsLog.logInfo(
						'Separations',
						'INFO BOX prefilled after Prepare: ' + separationData.length + ' row(s) (' +
						inks.length + ' ink(s) + ' + (separationData.length - inks.length) + ' UB)' +
						(res?.errors?.length ? ' with ' + res.errors.length + ' warning(s)' : '')
					);
				})
				.catch((err: any) => {
					this.leapSepsLog.logWarn('Separations', 'INFO BOX prefill failed: ' + (err?.message || err));
				});
		} catch (e: any) {
			this.leapSepsLog.logWarn('Separations', 'INFO BOX prefill error: ' + (e?.message || e));
		}
	}

	/*
	 * Two-stage separation. The separation row shows TWO buttons:
	 *   Prepare for Seps      (version document active)  -> host creates the SEP doc with LIVE art,
	 *                                                        status "preparedForSeps", leaves it open
	 *   Generate Separations  (prepared SEP doc active)   -> host splits the art as the user left it,
	 *                                                        status "separated", Plates tab opens
	 * Generate WITHOUT Prepare is no longer possible — the legacy single-shot call stays in the code
	 * (controller.performSeparation) but is not invoked from here.
	 */
	handlePrepareForSeps(separationId: number, graphicName: string): void {
		/*
		 * NN Pro products go through the STANDALONE pipeline — the LEAP host prepare needs the
		 * teamout folder tree + team JSON, which an NN Pro product does not have. The standalone
		 * flow needs neither (Charu, 2026-09-02).
		 */
		if (this.isNNProDoc) {
			this.openStandaloneFormForNNProGroup(separationId, graphicName);
			return;
		}
		/*
		 * Fresh selection check at click time (the polled hasIllustratorSelection only drives the
		 * label): something selected -> Prepare from Selection; nothing -> Prepare from the version
		 * document's SIZED_ART/SIZED_GRAPHICS/<graphic> item.
		 */
		const countPromise = this.isRunningInBrowser
			? Promise.resolve(0)
			: this.controller.getSelectionCount().catch(() => 0);
		countPromise.then((count) => {
			this.runSeparationStage('prepare', separationId, graphicName, count > 0);
		});
	}

	handleGenerateSeparations(separationId: number, graphicName: string): void {
		this.runSeparationStage('generate', separationId, graphicName);
	}

	private runSeparationStage(stage: 'prepare' | 'generate', separationId: number, graphicName: string, prepareFromSelection = false): void {
		if (!graphicName) {
			return;
		}

		const separation = this.separations.find((s) => s.id === separationId);
		if (!separation) {
			return;
		}

		this.leapSepsLog.logClick(
			stage === 'prepare'
				? (prepareFromSelection ? 'Prepare for Seps from Selection' : 'Prepare for Seps')
				: 'Generate separation',
			{
				separationId,
				graphicName,
				profile: separation.profile,
				styles: separation.styles
			}
		);

		const styleCodes = separation.styles || [];
		const profileName = separation.profile || '';
		const graphicColors = this.getGraphicColors(graphicName);
		const graphicDistress = this.getGraphicDistress(graphicName);
		const profileLookupOptions = { distress: graphicDistress };

		/* Captured for the INFO-BOX prefill after a successful Prepare (see prefillSepTableAfterPrepare). */
		let preparedProfileInfo: any = null;
		let preparedProfileMetadata: any = null;

		const getProfileCodeAndCreateSeparation = async () => {
			let profileCode = null;
			let profileInfo: any = null;

			if (profileName && !this.isRunningInBrowser) {
				try {
					const result = await this.controller.getProfileCodeFromName(profileName, profileLookupOptions);

					if (result && result.success && result.profileCode) {
						profileCode = result.profileCode;
					} else {
					}
				} catch (err) { }

				try {
					const profileLookupKey = profileCode || profileName;
					if (profileLookupKey) {
						const profileInfoResult = await this.controller.getProfileInformation(
							profileLookupKey,
							profileLookupOptions
						);
						console.log('[SEPARATIONS][UB_DEBUG] getProfileInformation result for', profileLookupKey, 'distress:', graphicDistress, ':', profileInfoResult);
						if (profileInfoResult && profileInfoResult.success && profileInfoResult.profileInfo) {
							profileInfo = profileInfoResult.profileInfo;
						}
					}
				} catch (profileInfoErr) { }
			}

			let artistName = '';
			let artistInitials = '';
			let sepsTemplateFileName = '';
			if (!this.isRunningInBrowser) {
				try {
					const gs = await this.controller.loadGeneralSettings();
					if (gs?.success && gs?.data) {
						artistName = gs.data.artistName != null ? String(gs.data.artistName) : '';
						artistInitials = gs.data.artistInitials != null ? String(gs.data.artistInitials) : '';
						sepsTemplateFileName =
							gs.data.sepsTemplateFileName != null ? String(gs.data.sepsTemplateFileName).trim() : '';
					}
				} catch (err) { }
			}

			const graphicData = this.graphicsData.find((g: any) => g && g.name === graphicName);
			const position = (graphicData && graphicData.position && String(graphicData.position).trim())
				? String(graphicData.position).trim()
				: '';

			// Resolve body color from first color code via COLOR_CODE_LOOKUP.xlsx (same folder as Styles.xlsx)
			let bodyColorData: any = null;
			const firstColorCode = Array.isArray(graphicColors) && graphicColors.length > 0 ? graphicColors[0] : null;
			if (firstColorCode && !this.isRunningInBrowser && this.controller.getColorByCodeFromLookup) {
				try {
					const lookupResult = await this.controller.getColorByCodeFromLookup(firstColorCode);
					if (lookupResult?.success && lookupResult.color) {
						bodyColorData = {
							bodyColor: lookupResult.color.hex,
							colorName: lookupResult.color.colorName,
							cmyk: lookupResult.color.cmyk,
							rgb: lookupResult.color.rgb
						};
						console.log('[SEPARATIONS] Body color from COLOR_CODE_LOOKUP.xlsx:', bodyColorData.colorName, bodyColorData.bodyColor);
					} else {
						console.warn('[SEPARATIONS] Color lookup failed for code:', firstColorCode, lookupResult?.error);
					}
				} catch (lookupErr) {
					console.warn('[SEPARATIONS] Color lookup error for code:', firstColorCode, lookupErr);
				}
			}

			/*
			 * Brand from the Styles.xlsx "Brand" column (first style that has one) — the host uses it
			 * for the [Brand] file/folder token (first letter: F for Fanatics, N for Nike) and to show
			 * the matching Footer sublayer in the SEP template at Prepare.
			 */
			let brandName = '';
			if (!this.isRunningInBrowser && styleCodes.length > 0) {
				try {
					const styleInfoResult = await this.controller.getStyleInformation(styleCodes);
					if (styleInfoResult?.success && styleInfoResult.styleInfoMap) {
						for (const code of styleCodes) {
							const info =
								styleInfoResult.styleInfoMap[code] ||
								styleInfoResult.styleInfoMap[String(code).trim()];
							const value = info && (info['Brand'] || info['brand'] || info['BRAND']);
							if (value && String(value).trim() !== '') {
								brandName = String(value).trim();
								break;
							}
						}
					}
					if (!brandName) {
						console.warn('[SEPARATIONS] No Brand value in Styles.xlsx for styles:', styleCodes);
					}
				} catch (brandErr) {
					console.warn('[SEPARATIONS] Brand lookup failed:', brandErr);
				}
			}

			const profileMetadata: any = {
				profileName: profileName,
				profileCode: profileCode,
				brand: brandName,
				styleCodes: styleCodes,
				colorCodes: graphicColors,
				graphicName: graphicName,
				createdDate: new Date().toISOString(),
				artistName: artistName,
				artistInitials: artistInitials,
				position: position,
				distress: graphicDistress,
				profileDistress: graphicDistress ? 'Y' : 'N'
			};
			if (profileInfo && profileInfo.found) {
				if (profileInfo.profileName) {
					profileMetadata.resolvedProfileName = String(profileInfo.profileName);
				}
				if (profileInfo.profileCode) {
					profileMetadata.profileCode = String(profileInfo.profileCode);
				}
				if (profileInfo.distress != null && String(profileInfo.distress).trim() !== '') {
					profileMetadata.profileDistress = String(profileInfo.distress).trim().toUpperCase() === 'Y' ? 'Y' : 'N';
				}
				const toEnabled = (value: any) => {
					if (value === true || value === 1) return true;
					if (typeof value === 'string') {
						const normalized = value.trim().toUpperCase();
						return normalized === 'Y' || normalized === 'YES' || normalized === 'TRUE' || normalized === '1';
					}
					return false;
				};
				profileMetadata.underbaseEnabled = [
					true,
					!!profileInfo.underbase2Enabled,
					!!profileInfo.underbase3Enabled,
					!!profileInfo.underbase4Enabled
				];
				profileMetadata.underbaseMeshes = [
					profileInfo.ub1Mesh != null ? String(profileInfo.ub1Mesh) : '',
					profileInfo.ub2Mesh != null ? String(profileInfo.ub2Mesh) : '',
					profileInfo.ub3Mesh != null ? String(profileInfo.ub3Mesh) : '',
					profileInfo.ub4Mesh != null ? String(profileInfo.ub4Mesh) : ''
				];
				profileMetadata.underbaseKnockoutBlack = Array.isArray(profileInfo.underbaseKnockoutBlack)
					? [
						!!profileInfo.underbaseKnockoutBlack[0],
						!!profileInfo.underbaseKnockoutBlack[1],
						!!profileInfo.underbaseKnockoutBlack[2],
						!!profileInfo.underbaseKnockoutBlack[3]
					]
					: [false, false, false, false];
				const defaultUbSwatches = ['White UB', 'White UB', 'White UB', 'White UB'];
				const srcUbSwatches = (profileInfo as any).underbaseKnockoutSwatches;
				profileMetadata.underbaseKnockoutSwatches = Array.isArray(srcUbSwatches)
					? [0, 1, 2, 3].map((j) =>
						srcUbSwatches[j] != null && String(srcUbSwatches[j]).trim() !== ''
							? String(srcUbSwatches[j]).trim()
							: defaultUbSwatches[j]
					)
					: [...defaultUbSwatches];
				/*
				 * Custom per-UB names live in the raw Profiles.json (the Node profileInfo does not expose
				 * them), so read them directly and thread them through so the JSX underbase generator can
				 * use each custom name for the underbase swatch + layer name.
				 */
				profileMetadata.underbaseNames = await this.resolveUnderbaseNamesForProfile(
					profileMetadata.profileCode,
					profileMetadata.resolvedProfileName || profileName
				);
				profileMetadata.blackInksKnockoutDisplay =
					profileInfo.blackInksKnockoutDisplay != null
						? String(profileInfo.blackInksKnockoutDisplay)
						: '';
				profileMetadata.underbaseSwatch =
					(profileInfo as any).underbaseSwatch != null && String((profileInfo as any).underbaseSwatch).trim() !== ''
						? String((profileInfo as any).underbaseSwatch).trim()
						: ((profileInfo as any)['Underbase Swatch'] != null && String((profileInfo as any)['Underbase Swatch']).trim() !== ''
							? String((profileInfo as any)['Underbase Swatch']).trim()
							: 'White UB');
				profileMetadata.blocker = toEnabled((profileInfo as any).blocker);
				profileMetadata.blockerMesh =
					(profileInfo as any).blockerMesh != null
						? String((profileInfo as any).blockerMesh)
						: (
							(profileInfo as any)['Blocker Mesh'] != null
								? String((profileInfo as any)['Blocker Mesh'])
								: ''
						);
				profileMetadata.formatInkNameLabel = !!(profileInfo as any).formatInkNameLabel;
				profileMetadata.colorNameLabelFormat =
					(profileInfo as any).colorNameLabelFormat != null && String((profileInfo as any).colorNameLabelFormat).trim() !== ''
						? String((profileInfo as any).colorNameLabelFormat)
						: 'PANTONE ### C';
				console.log('[SEPARATIONS][UB_DEBUG] profileMetadata underbase flags/meshes:', {
					profileName,
					profileCode,
					graphicDistress,
					profileDistress: profileMetadata.profileDistress,
					resolvedProfileName: profileMetadata.resolvedProfileName,
					underbaseEnabled: profileMetadata.underbaseEnabled,
					underbaseMeshes: profileMetadata.underbaseMeshes,
					underbaseKnockoutBlack: profileMetadata.underbaseKnockoutBlack,
					underbaseKnockoutSwatches: profileMetadata.underbaseKnockoutSwatches,
					underbaseSwatch: profileMetadata.underbaseSwatch,
					blackInksKnockoutDisplay: profileMetadata.blackInksKnockoutDisplay
				});
			} else {
				console.warn('[SEPARATIONS][UB_DEBUG] No profileInfo found; underbaseEnabled not set on metadata', {
					profileName,
					profileCode
				});
			}
			if (bodyColorData) {
				profileMetadata.bodyColorData = bodyColorData;
			}

			const graphicUnderbaseSwatch =
				graphicData?.underbase234Swatch ||
				graphicData?.underbase2Swatch ||
				'';
			if (graphicUnderbaseSwatch && String(graphicUnderbaseSwatch).trim() !== '') {
				const ubSwatch = String(graphicUnderbaseSwatch).trim();
				profileMetadata.underbase2Swatch = ubSwatch;
				profileMetadata.underbase3Swatch = ubSwatch;
				profileMetadata.underbase4Swatch = ubSwatch;
			}

			if (!this.isRunningInBrowser && this.teamCode && this.controller.getBatchRowVariableSource) {
				const docPath = this.versionDocumentPath || undefined;
				try {
					const batchVar = await this.controller.getBatchRowVariableSource(this.teamCode, docPath);
					if (batchVar?.success && batchVar.fields && Object.keys(batchVar.fields).length > 0) {
						profileMetadata.batchVariableSource = batchVar.fields;
					}
				} catch (batchErr) {
					console.warn('[SEPARATIONS] batchVariableSource from Batch Excel skipped:', batchErr);
				}
			}

			/*
			 * Separation file NAME comes from the Export Settings "Separation file path" pattern. The host
			 * resolves its tokens (from the team JSON batch row + position/profile) and uses its basename;
			 * the folder stays the standard 09 SEPARATIONS/[League]/[Team]/[Graphic]/ structure.
			 */
			if (this.separationFilePathPattern && this.separationFilePathPattern.trim() !== '') {
				profileMetadata.separationFileNamePattern = this.separationFilePathPattern.trim();
			}

			preparedProfileInfo = profileInfo;
			preparedProfileMetadata = profileMetadata;
			console.log('[SEPARATIONS][UB_DEBUG] ' + stage + ' payload profileMetadata:', profileMetadata);
			if (stage === 'prepare') {
				return this.controller.prepareForSeps(graphicName, styleCodes, profileMetadata, {
					sepsTemplateFileName,
					prepareFromSelection
				});
			}
			/* Generate runs on the prepared SEP doc; the host reads profileMetadata back from that
			   document's XMP (stamped at Prepare, possibly edited since), so what we pass is advisory. */
			return this.controller.generateFromPrepared(graphicName, styleCodes, profileMetadata, { sepsTemplateFileName });
			/* LEGACY single-shot (no Prepare step) — intentionally disabled, kept for reference:
			return this.controller.performSeparation(graphicName, styleCodes, profileMetadata, {
				sepsTemplateFileName
			});
			*/
		};

		getProfileCodeAndCreateSeparation()
			.then((result) => {
				console.log('[SEPARATIONS] ' + stage + ' result:', result);
				if (result.success) {
					setTimeout(() => {
						this.loadSeparationPaths();
					}, 1000);

					setTimeout(() => {
						this.loadSeparationPaths();
					}, 2500);

					setTimeout(() => {
						this.loadSeparationPaths();
					}, 4000);

					if (stage === 'prepare') {
						/*
						 * Stay on the Separations tab: the prepared SEP document is now the active document,
						 * so a refresh flips the buttons (Prepare disabled, Generate enabled) and the user can
						 * edit the art before generating.
						 */
						this.dataIssues.clear('separation-generate');
						/* Fill the document's printed PG Ink / GRID INFO BOX from the profile (document-only
						   preview; Generate rewrites it from the real plates). */
						this.prefillSepTableAfterPrepare(preparedProfileInfo, preparedProfileMetadata);
						this.refreshData();
						return;
					}

					const tabNavigation = (window as any).__LEAP_TAB_NAVIGATION__;
					if (tabNavigation && typeof tabNavigation.navigateToTab === 'function') {
						tabNavigation.navigateToTab(2);

						setTimeout(() => {
							if ((window as any).__LEAP_SEPARATION_COLORS_REFRESH__) {
								(window as any).__LEAP_SEPARATION_COLORS_REFRESH__();
							}
						}, 500);
					}
				} else {
					const message =
						result?.error ||
						'Separation failed. See today\'s log in Documents/LEAP Settings/Logs/LEAP_Seps.';
					this.leapSepsLog.logError('Separations', message, result);
					console.error('[SEPARATIONS] performSeparation failed:', result);
					this.reportFailure('separation-generate', message);
				}
			})
			.catch((err) => {
				this.leapSepsLog.logError('Separations', err);
				console.error('[SEPARATIONS] performSeparation error:', err);
				this.reportFailure('separation-generate', err?.message || String(err));
			});
	}

	/*
	 * Open a previously generated separation from its RECORDED absolute path.
	 *
	 * The path is whatever the separation wrote down (XMP entry / sidecar), so it is correct wherever the
	 * file was created. It can still go stale: the user may move, rename or delete the .ai outside the
	 * panel. That used to fail silently — the click did nothing and no message appeared — so a missing
	 * file now says so and offers the fix (re-generate), which is the agreed stale-sidecar behaviour.
	 */
	handleOpenSeparation(filePath: string): void {
		this.controller
			.openSeparationDocument(filePath)
			.then((result) => {
				if (result.success) {
					setTimeout(() => {
						const tabNavigation = (window as any).__LEAP_TAB_NAVIGATION__;
						if (tabNavigation && typeof tabNavigation.navigateToTab === 'function') {
							tabNavigation.navigateToTab(2);

							setTimeout(() => {
								if ((window as any).__LEAP_SEPARATION_COLORS_REFRESH__) {
									(window as any).__LEAP_SEPARATION_COLORS_REFRESH__();
								}
							}, 500);
						}
					}, 500);
					return;
				}
				const message =
					'Separation file not found:\n' +
					(filePath || '(no path recorded)') +
					'\n\nIt may have been moved, renamed or deleted. Generate the separation again to recreate it.';
				this.leapSepsLog.logError('Separations', message, result);
				console.error('[SEPARATIONS] openSeparationDocument failed:', result);
				this.reportFailure('separation-open', message.replace(/\n+/g, ' '));
			})
			.catch((err) => {
				this.leapSepsLog.logError('Separations', err);
				console.error('[SEPARATIONS] openSeparationDocument error:', err);
				this.reportFailure('separation-open', err?.message || String(err));
			});
	}

	/* Profiles the user deleted for THIS document (XMP LEAPSuppressedSeparationProfiles). */
	suppressedProfiles: string[] = [];

	private isProfileSuppressed(profileName: string): boolean {
		const target = String(profileName || '').trim().toUpperCase();
		return this.suppressedProfiles.some((p) => String(p || '').trim().toUpperCase() === target);
	}

	/* Applied wherever the list is (re)built, so a deleted profile stays gone across reloads. */
	private filterSuppressedGroups(list: Separation[]): Separation[] {
		if (!this.suppressedProfiles.length) return list;
		const kept = list.filter((sep) => !this.isProfileSuppressed(sep.profile));
		if (kept.length !== list.length) {
			console.log('[Separations] Suppressed profiles hidden:', list.length - kept.length);
		}
		return kept;
	}

	/* Did this row come from a manual Add Separation (XMP), rather than Styles.xlsx grouping? */
	isXmpSeparationGroup(separation: Separation): boolean {
		const profile = String(separation?.profile || '').trim().toUpperCase();
		return this.xmpSeparationGroups.some((g) => String(g.profile || '').trim().toUpperCase() === profile);
	}

	/*
	 * Row menu: Delete on EVERY group. Manually added (XMP) groups get their entries removed;
	 * Excel-derived groups are SUPPRESSED per document (they regenerate from the team style codes
	 * otherwise). A group WITH a generated file also deletes that file — hot-market case: the garment
	 * code dictates e.g. HSWB by default but the job prints plastisol, so the user adds the right
	 * profile manually and deletes the default one even after it was generated.
	 */
	getSeparationMenuItems(separation: Separation, graphicName: string): string[] {
		return ['Edit', 'Delete', 'Duplicate'];
	}

	/* Delete confirmation state (mirrors the other confirm dialogs). filePath set = also delete the file. */
	separationDeleteTarget: { separationId: number; graphicName: string; profileName: string; filePath: string } | null = null;

	get separationDeleteMessage(): string {
		const t = this.separationDeleteTarget;
		if (!t) return '';
		const base = 'Delete the separation profile \u201C' + t.profileName + '\u201D? It will no longer be listed for this document (Add Separation brings it back).';
		if (!t.filePath) return base;
		const fileName = t.filePath.split(/[\\/]/).pop() || t.filePath;
		return base + ' The generated separation file \u201C' + fileName + '\u201D will also be DELETED from disk.';
	}

	confirmDeleteSeparationGroup(): void {
		const target = this.separationDeleteTarget;
		this.separationDeleteTarget = null;
		if (!target) return;
		/*
		 * Delete = remove any manual XMP entries for the profile AND suppress the profile for this
		 * document. Suppression is what makes deletion stick for Excel-derived groups (0 XMP entries
		 * is a NORMAL outcome for those, not a failure); the entry removal keeps the XMP tidy for
		 * manually added ones.
		 */
		const deleteFileFirst: Promise<string> = target.filePath
			? this.controller.deleteSeparationFileFromDisk(target.filePath).then((r: any) => (r?.success ? '' : (r?.error || 'Unknown error')))
			: Promise.resolve('');
		deleteFileFirst
			.then((fileError: string) => {
				if (fileError) {
					/* File deletion failing must stop the whole delete — suppressing the row while the
					   file survives on disk would hide a real separation. */
					this.reportFailure('separation-delete', 'Could not delete the separation file: ' + fileError);
					throw new Error('__handled__');
				}
			})
			.then(() => this.controller
				.removeSeparationProfileDataEntry({ graphicName: target.graphicName, profileName: target.profileName })
				.catch(() => ({ removed: 0 })))
			.then((res: any) =>
				this.controller
					.setSeparationProfileSuppressed(target.profileName, true)
					.then((sup: any) => ({ removed: res?.removed || 0, sup }))
			)
			.then(({ removed, sup }: any) => {
				if (sup?.success) {
					this.leapSepsLog.logInfo(
						'Separations',
						'Deleted separation group ' + target.profileName +
						' (suppressed for this document; ' + removed + ' XMP entr' + (removed === 1 ? 'y' : 'ies') + ' removed)'
					);
					this.suppressedProfiles.push(target.profileName);
					this.separations = this.filterSuppressedGroups(this.separations);
					this.cdr.detectChanges();
					this.loadSeparationPaths();
				} else {
					this.reportFailure('separation-delete', 'Could not delete the separation: ' + (sup?.error || 'Unknown error'));
				}
			})
			.catch((err: any) => {
				if (err?.message !== '__handled__') {
					this.reportFailure('separation-delete', 'Could not delete the separation: ' + (err?.message || err));
				}
			});
	}

	cancelDeleteSeparationGroup(): void {
		this.separationDeleteTarget = null;
		this.cdr.detectChanges();
	}

	handleSeparationMenuClick(item: string, separationId: number, graphicName: string): void {
		this.leapSepsLog.logClick('Separation menu: ' + item, { separationId, graphicName });
		if (item === 'Delete') {
			const separation = this.separations.find((sep) => sep.id === separationId);
			if (separation) {
				this.separationDeleteTarget = {
					separationId,
					graphicName,
					profileName: separation.profile,
					filePath: this.getSeparationPath(separation, graphicName) || ''
				};
				this.cdr.detectChanges();
			}
			return;
		}
		if (this.isRunningInBrowser) {
			return;
		}
		const separation = this.separations.find((s) => s.id === separationId);
		if (!separation) {
			return;
		}

		if (item === 'Delete Separation File') {
			const filePath = this.getSeparationPath(separation, graphicName);
			if (!filePath) {
				return;
			}
			this.deleteSeparationFileContext = {
				graphicName,
				separationId,
				profileName: separation.profile,
				filePath
			};
			this.showDeleteSeparationFileConfirm = true;
			this.cdr.detectChanges();
			return;
		}

		if (item === 'Duplicate') {
			this.openSeparationActionDialog('duplicate', graphicName, separation, false);
			return;
		}

		if (item === 'Edit') {
			this.openSeparationActionDialog('edit-new', graphicName, separation, false);
		}
	}

	/*
	 * Styles a manual profile-add is FOR: the codes currently showing "Unknown Profile" on this
	 * graphic. Falls back to the graphic's full style set when nothing is missing (adding a second
	 * profile on purpose) — never the whole Styles.xlsx catalog.
	 */
	get addSeparationTargetStyleCodes(): string[] {
		const missing = new Set<string>();
		const all = new Set<string>();
		for (const sep of this.separations) {
			for (const sc of sep.styles || []) {
				const code = String(sc || '').trim();
				if (!code) continue;
				all.add(code);
				if (this.hasUnknownProfile(sep) || this.isProfileMissingInSettings(sep)) {
					missing.add(code);
				}
			}
		}
		return Array.from(missing.size > 0 ? missing : all);
	}

	async handleAddSeparation(graphicName: string): Promise<void> {
		if (!graphicName) {
			return;
		}
		await this.ensureStyleCatalogOptionsLoaded();
		this.addSeparationDialogGraphicName = graphicName;
		this.addSeparationDialogOpen = true;
		console.log('[Separations] Opening Add Separation dialog', {
			styleCatalogOptionsCount: this.styleCatalogOptions.length,
			teamCode: this.teamCode,
			versionDocumentPath: this.versionDocumentPath || '(none)'
		});
		this.cdr.detectChanges();
	}

	/*
	 * Write one new standalone job per chosen style code: a clone of the source job carrying the new
	 * profile/style, keyed on exportedFilePath + profileName so it ADDS rather than replaces. The
	 * exported .ai is shared — only the separation settings differ.
	 */
	private async addStandaloneSeparationEntries(
		sourceJob: any,
		profileName: string,
		styleCodes: string[]
	): Promise<void> {
		if (this.isRunningInBrowser || typeof this.controller.writeStandaloneJobToXmp !== 'function') {
			console.warn('[Separations] Cannot add standalone separation - controller method unavailable');
			return;
		}
		this.isLoadingAddSeparationDialog = true;
		this.cdr.detectChanges();
		try {
			/*
			 * ONE job for the profile, carrying ALL its style codes — mirroring the LEAP list, where a profile
			 * is a single row listing every style that resolved to it.
			 *
			 * Writing one job PER style code was wrong: they all share the upsert key
			 * (exportedFilePath + profileName), so each overwrote the previous one and 16 codes produced a
			 * single surviving entry.
			 */
			const job = {
				...sourceJob,
				profileName: profileName,
				styleCode: styleCodes.join(', ')
			};
			delete job.autoGenerate;
			const docPath = job.sourceDocumentPath || '';
			console.log('[Separations] Adding standalone separation', {
				profileName,
				styleCodes,
				exportedFilePath: job.exportedFilePath,
				sourceDocumentPath: docPath || '(active document)'
			});
			const res: any = await this.controller.writeStandaloneJobToXmp(job, docPath);
			console.log('[Separations] writeStandaloneJobToXmp response', res);
			if (!res || !res.success) {
				const msg = (res && res.error) || 'Unknown error';
				console.error('[Separations] Could not add standalone separation:', msg);
				this.leapSepsLog.logError('Separations', 'Add separation failed: ' + msg);
				this.reportFailure('separation-add', 'Could not add the separation: ' + msg);
				return;
			}
			/* Re-read so the list reflects exactly what is now recorded on the document. */
			await this.loadStandaloneJobs();
			console.log('[Separations] Standalone jobs after add:', this.standaloneJobs.length);
		} catch (err: any) {
			console.error('[Separations] Add standalone separation failed:', err);
			this.leapSepsLog.logError('Separations', err);
			this.reportFailure('separation-add', 'Could not add the separation: ' + ((err && err.message) || String(err)));
		} finally {
			this.isLoadingAddSeparationDialog = false;
			this.cdr.detectChanges();
		}
	}

	cancelAddSeparationDialog(): void {
		this.addSeparationDialogOpen = false;
		this.addSeparationDialogGraphicName = '';
		this.addSeparationStandaloneJob = null;
		this.cdr.detectChanges();
	}

	// ----- TEAMOUT-WIDE MANUAL STYLE->PROFILE DECISIONS — PARKED (2026-08-25) -----
	// Fully built (compiles clean); disabled on user decision until scheduled.
	// Re-enable: uncomment this block, the two call sites marked "TEAMOUT-SCOPE PERSISTENCE — parked",
	// and the scope radios in add-separation-dialog.component.html. Design: docs/TODO.md "Teamout profile overrides".
	// 	/* ----- Teamout-wide manual style->profile decisions ----- */

	// 	/*
	// 	 * Overrides live in ONE json at the job root (the folder that contains 01 TEAMOUTS), keyed by
	// 	 * style code — so a decision made once ("991N is Fanatics-Plastisol") applies to every file of
	// 	 * the teamout, exactly like the user asked. Read best-effort on every separations load and merged
	// 	 * over the Styles.xlsx map (an explicit user decision wins over the sheet).
	// 	 */
	// 	private teamoutOverridesPath(): string {
	// 		try {
	// 			const req = (window as any).cep_node?.require;
	// 			if (!req || !this.versionDocumentPath) return '';
	// 			const fs = req('fs');
	// 			const path = req('path');
	// 			let dir = path.dirname(String(this.versionDocumentPath));
	// 			for (let up = 0; up < 12; up++) {
	// 				if (fs.existsSync(path.join(dir, '01 TEAMOUTS'))) {
	// 					return path.join(dir, 'style_profile_overrides.json');
	// 				}
	// 				const parent = path.dirname(dir);
	// 				if (!parent || parent === dir) break;
	// 				dir = parent;
	// 			}
	// 		} catch (e) { /* best-effort */ }
	// 		return '';
	// 	}

	// 	private readTeamoutProfileOverrides(): { [styleCode: string]: string } {
	// 		try {
	// 			const req = (window as any).cep_node?.require;
	// 			const file = this.teamoutOverridesPath();
	// 			if (!req || !file) return {};
	// 			const fs = req('fs');
	// 			if (!fs.existsSync(file)) return {};
	// 			const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
	// 			return parsed && typeof parsed === 'object' ? parsed : {};
	// 		} catch (e) {
	// 			return {};
	// 		}
	// 	}

	// 	private writeTeamoutProfileOverrides(styleCodes: string[], profileName: string): void {
	// 		try {
	// 			const req = (window as any).cep_node?.require;
	// 			const file = this.teamoutOverridesPath();
	// 			if (!req || !file) {
	// 				this.leapSepsLog.logWarn('Separations', 'Teamout override not saved - job root not found from ' + (this.versionDocumentPath || '(no doc)'));
	// 				return;
	// 			}
	// 			const fs = req('fs');
	// 			const current = this.readTeamoutProfileOverrides();
	// 			styleCodes.forEach((sc) => { current[String(sc).trim()] = profileName; });
	// 			fs.writeFileSync(file, JSON.stringify(current, null, 2), 'utf8');
	// 			this.leapSepsLog.logInfo('Separations', 'Teamout profile override saved: ' + styleCodes.join(', ') + ' -> ' + profileName + ' (' + file + ')');
	// 		} catch (e: any) {
	// 			this.leapSepsLog.logError('Separations', 'Teamout override write failed: ' + (e?.message || e));
	// 		}
	// 	}

	// 	/* Merge decisions over the Styles.xlsx map — normalized on style code, override wins. */
	// 	private applyTeamoutOverrides(profileMap: { [k: string]: string }, styleCodes: string[]): void {
	// 		const overrides = this.readTeamoutProfileOverrides();
	// 		const norm = (v: string) => String(v || '').toUpperCase().replace(/[\s\u00A0]+/g, '');
	// 		const byNorm: { [k: string]: string } = {};
	// 		Object.keys(overrides).forEach((k) => { byNorm[norm(k)] = overrides[k]; });
	// 		let applied = 0;
	// 		styleCodes.forEach((sc) => {
	// 			const hit = byNorm[norm(sc)];
	// 			if (hit) { profileMap[sc] = hit; applied++; }
	// 		});
	// 		if (applied > 0) {
	// 			console.log('[Separations] Applied teamout profile overrides for', applied, 'style code(s)');
	// 		}
	// 	}


	async confirmAddSeparationDialog(result: AddSeparationDialogResult): Promise<void> {
		console.log('[Separations] confirmAddSeparationDialog invoked', {
			graphicName: this.addSeparationDialogGraphicName,
			result
		});
		const profileName = String(result?.profileName || '').trim();
		const styleCodes = Array.isArray(result?.styleCodes)
			? result.styleCodes.map((s) => String(s || '').trim()).filter(Boolean)
			: [];
		if (!profileName || styleCodes.length === 0) {
			console.warn('[Separations] confirmAddSeparationDialog aborted - invalid payload', {
				profileName,
				styleCodes
			});
			this.cancelAddSeparationDialog();
			return;
		}

		/* TEAMOUT-SCOPE PERSISTENCE — parked (2026-08-25), see docs/TODO.md "Teamout profile overrides".
		if (result?.scope === 'teamout') {
			this.writeTeamoutProfileOverrides(styleCodes, profileName);
		}
		*/

		/* Adding a profile back clears its per-document suppression — otherwise the new group would be
		   filtered out on the very next load and the add would look like it did nothing. */
		if (this.isProfileSuppressed(profileName)) {
			this.suppressedProfiles = this.suppressedProfiles.filter(
				(prof) => String(prof || '').trim().toUpperCase() !== profileName.trim().toUpperCase()
			);
			this.controller.setSeparationProfileSuppressed(profileName, false).catch(() => { /* best-effort */ });
		}

		/* Standalone: persist as another LEAPStandaloneJobs entry, not a LEAP XMP row. */
		if (this.addSeparationStandaloneJob) {
			await this.addStandaloneSeparationEntries(this.addSeparationStandaloneJob, profileName, styleCodes);
			this.cancelAddSeparationDialog();
			return;
		}

		const upsertMany = (codes: string[]) => {
			let next = [...this.separations];
			codes.forEach((styleCode) => {
				next = this.upsertSeparationGroupInList(next, profileName, styleCode);
			});
			this.separations = next;
		};

		if (this.isRunningInBrowser) {
			console.log('[Separations] Browser mode add separation - applying UI only', {
				profileName,
				styleCodes
			});
			upsertMany(styleCodes);
			this.cancelAddSeparationDialog();
			return;
		}

		if (!this.controller.addSeparationProfileDataEntry) {
			console.warn('[Separations] addSeparationProfileDataEntry is not available');
			this.cancelAddSeparationDialog();
			return;
		}

		this.isLoadingAddSeparationDialog = true;
		this.cdr.detectChanges();
		try {
			let profileCode: string | null = null;
			try {
				const codeRes = await this.controller.getProfileCodeFromName(profileName);
				if (codeRes?.success && codeRes.profileCode) {
					profileCode = String(codeRes.profileCode);
				}
			} catch (_) {
				profileCode = null;
			}

			const saveResult = await this.controller.addSeparationProfileDataEntry({
				graphicName: this.addSeparationDialogGraphicName,
				profileName,
				styleCodes,
				profileCode
			});
			console.log('[Separations] addSeparationProfileDataEntry response', saveResult);
			if (saveResult?.success) {
				upsertMany(styleCodes);
				// ROI: one sepcreate event per separation created (see services/roi.ts; never throws)
				roiLogEvent({
					action: 'sepcreate',
					doc: this.addSeparationDialogGraphicName || '',
					elements: { StyleCodes: styleCodes.length }
				});
				// Refresh XMP-derived groups to ensure reopen consistency.
				await this.loadSeparationPaths(true);
				console.log('[Separations] Add separation completed successfully', {
					profileName,
					styleCodes
				});
			} else {
				console.warn('[Separations] Failed to add separation profile entry:', saveResult?.error);
			}
		} catch (err) {
			console.error('[Separations] Error adding separation profile entry:', err);
		} finally {
			this.isLoadingAddSeparationDialog = false;
			this.cancelAddSeparationDialog();
		}
	}

	private openSeparationActionDialog(
		mode: 'duplicate' | 'edit-new',
		graphicName: string,
		separation: Separation,
		isNew: boolean
	): void {
		const profileOpts = isNew
			? [...this.profileNamesFromSettings]
			: this.profileNamesFromSettings.indexOf(separation.profile) >= 0
				? [...this.profileNamesFromSettings]
				: [...this.profileNamesFromSettings, separation.profile];

		this.separationActionDialogMode = mode;
		this.separationActionDialogIsNew = isNew;
		this.separationActionDialogContext = isNew
			? { graphicName, separationId: -1, originalProfileName: '' }
			: {
				graphicName,
				separationId: separation.id,
				originalProfileName: separation.profile
			};
		this.separationActionDialogStyleCodes = isNew ? [...this.allTeamStyleCodes] : [...(separation.styles || [])];
		this.separationActionDialogInitialProfile =
			isNew && profileOpts.length > 0 ? profileOpts[0] : separation.profile || (profileOpts[0] || '');
		this.separationActionDialogInitialStyles = isNew ? [] : [...(separation.styles || [])];
		const path = isNew ? null : this.getSeparationPath(separation, graphicName);
		this.separationActionDialogHasFile = !!path;
		this.separationActionDialogInitialDuplicateAi = true;
		this.separationActionDialogInitialScaleEnabled = false;
		this.separationActionDialogInitialScalePercent = 100;
		this.separationActionDialogOpen = true;
		this.cdr.detectChanges();
	}

	cancelDeleteSeparationFile(): void {
		this.showDeleteSeparationFileConfirm = false;
		this.deleteSeparationFileContext = null;
		this.cdr.detectChanges();
	}

	confirmDeleteSeparationFile(): void {
		const ctx = this.deleteSeparationFileContext;
		this.showDeleteSeparationFileConfirm = false;
		this.deleteSeparationFileContext = null;
		this.cdr.detectChanges();
		if (!ctx || this.isRunningInBrowser) {
			return;
		}
		this.controller
			.deleteSeparationFile({
				graphicName: ctx.graphicName,
				profileName: ctx.profileName,
				filePath: ctx.filePath
			})
			.then((res) => {
				if (res?.success) {
					this.loadSeparationPaths();
				}
			})
			.catch(() => { });
	}

	cancelSeparationActionDialog(): void {
		this.separationActionDialogOpen = false;
		this.separationActionDialogContext = null;
		this.cdr.detectChanges();
	}

	async confirmSeparationActionDialog(result: SeparationProfileActionDialogResult): Promise<void> {
		const ctx = this.separationActionDialogContext;
		if (!ctx || this.isRunningInBrowser) {
			this.cancelSeparationActionDialog();
			return;
		}

		if (this.separationActionDialogIsNew) {
			const nextId =
				this.separations.length === 0 ? 1 : Math.max(...this.separations.map((s) => s.id)) + 1;
			this.separations = [
				...this.separations,
				{
					id: nextId,
					profile: result.profileName,
					styles: [...result.styleCodes],
					colors: [],
					sepFileName: '',
					isCreated: false
				}
			];
			this.separationActionDialogOpen = false;
			this.separationActionDialogContext = null;
			this.cdr.detectChanges();
			return;
		}

		const separation = this.separations.find((s) => s.id === ctx.separationId);
		if (!separation) {
			this.cancelSeparationActionDialog();
			return;
		}

		let profileCode: string | null | undefined = undefined;
		if (result.profileName !== ctx.originalProfileName) {
			try {
				const codeRes = await this.controller.getProfileCodeFromName(result.profileName);
				if (codeRes?.success && codeRes.profileCode) {
					profileCode = String(codeRes.profileCode);
				}
			} catch {
				profileCode = null;
			}
		}

		const patch: any = {
			graphicName: ctx.graphicName,
			matchProfileName: ctx.originalProfileName,
			profileName: result.profileName,
			styleCodes: result.styleCodes,
			duplicateAiFile: result.duplicateAiFile === true,
			scaleEnabled: result.scaleEnabled === true,
			scalePercent: result.scalePercent
		};
		if (profileCode != null) {
			patch.profileCode = profileCode;
		}

		this.controller
			.updateSeparationProfileDataEntry(patch)
			.then((res) => {
				if (res?.success) {
					separation.profile = result.profileName;
					separation.styles = [...result.styleCodes];
					this.separationActionDialogOpen = false;
					this.separationActionDialogContext = null;
					this.loadSeparationPaths();
				}
			})
			.catch(() => { });
	}

	checkAllGraphicFolders(): void {
		this.graphicOptions.forEach((graphic) => {
			this.checkGraphicFolderExists(graphic);
		});
	}

	private async ensureStyleCatalogOptionsLoaded(): Promise<void> {
		if (this.isRunningInBrowser) return;

		this.isLoadingAddSeparationDialog = true;
		this.cdr.detectChanges();
		try {
			// React parity: load style list directly from SETTINGS/LEAP_SEPS/Data/Styles.xlsx.
			const catalogResult = await this.controller.getStylesCatalogFromExcel();
			if (catalogResult?.success && Array.isArray(catalogResult.styles) && catalogResult.styles.length > 0) {
				this.styleCatalogOptions = catalogResult.styles.map((item: any) => ({
					styleCode: String(item?.styleCode || '').trim(),
					profileName: String(item?.profileName || 'Unknown Profile').trim(),
					styleDesc: String(item?.styleDesc || '').trim()
				})).filter((item: AddSeparationDialogStyleOption) => !!item.styleCode);
				console.log('[Separations] Add dialog style catalog loaded from Styles.xlsx', {
					styleCatalogOptionsCount: this.styleCatalogOptions.length
				});
				return;
			}
			console.warn('[Separations] Styles.xlsx catalog load failed', {
				success: !!catalogResult?.success,
				error: catalogResult?.error ?? 'none'
			});

			// Fallback: legacy team-code + batch-excel flow.
			if (!this.teamCode || this.teamCode === '') {
				this.styleCatalogOptions = [];
				console.warn('[Separations] Add dialog style catalog unavailable (no teamCode + empty Styles.xlsx catalog)');
				return;
			}
			const styleResult = await this.controller.getStyleCodesFromExcel(this.teamCode, this.versionDocumentPath || undefined);
			if (!styleResult?.success || !Array.isArray(styleResult?.styleCodes) || styleResult.styleCodes.length === 0) {
				this.styleCatalogOptions = [];
				console.warn('[Separations] Add dialog style catalog: no style codes (fallback flow)', {
					success: !!styleResult?.success,
					count: styleResult?.styleCodes?.length ?? 0,
					error: styleResult?.error ?? 'none'
				});
				return;
			}
			const styleCodes = styleResult.styleCodes.map((sc: any) => String(sc || '').trim()).filter(Boolean);
			const profileResult = await this.controller.getProfileNamesFromExcel(styleCodes);
			const profileMap = profileResult?.success && profileResult?.profileMap ? profileResult.profileMap : {};
			this.styleCatalogOptions = styleCodes.map((styleCode: string) => ({
				styleCode,
				profileName: String(profileMap[styleCode] || 'Unknown Profile').trim(),
				styleDesc: ''
			}));
			console.log('[Separations] Add dialog style catalog loaded from fallback flow', {
				styleCatalogOptionsCount: this.styleCatalogOptions.length
			});
		} catch (err) {
			this.styleCatalogOptions = [];
			console.error('[Separations] Add dialog style catalog load error:', err);
		} finally {
			this.isLoadingAddSeparationDialog = false;
			this.cdr.detectChanges();
		}
	}

	checkGraphicFolderExists(graphic: string): void {
		if (!graphic || graphic.trim() === '') {
			this.graphicFolderStatus[graphic] = false;
			this.graphicFileStatus[graphic] = false;
			return;
		}

		this.isCheckingFolderMap[graphic] = true;
		this.controller
			.checkGraphicFolderExists(graphic)
			.then((result) => {
				if (result.success) {
					this.graphicFolderStatus[graphic] = result.folderExists || false;
					this.graphicFileStatus[graphic] = result.graphicsFileExists || false;
				} else {
					this.graphicFolderStatus[graphic] = false;
					this.graphicFileStatus[graphic] = false;
				}
			})
			.catch((err) => {
				this.graphicFolderStatus[graphic] = false;
				this.graphicFileStatus[graphic] = false;
			})
			.finally(() => {
				this.isCheckingFolderMap[graphic] = false;
				this.cdr.detectChanges();
			});
	}

	isFolderChecking(graphic: string): boolean {
		return !!this.isCheckingFolderMap[graphic];
	}

	getGraphicFolderStatus(graphic: string): boolean {
		return !!this.graphicFolderStatus[graphic];
	}

	getGraphicFileStatus(graphic: string): boolean {
		return !!this.graphicFileStatus[graphic];
	}

	getFileNameFromPath(path: string): string {
		if (!path) return '';
		const parts = path.split(/[/\\]/);
		return parts[parts.length - 1] || path;
	}

	hasUnknownProfile(separation: Separation): boolean {
		return separation.profile === 'Unknown Profile';
	}

	getMissingStyleCodes(separation: Separation): string[] {
		if (this.hasUnknownProfile(separation)) {
			return separation.styles || [];
		}
		return [];
	}

	/** True when the separation's profile is not in Profiles.json (profile file missing or profile not added). */
	isProfileMissingInSettings(separation: Separation): boolean {
		if (!this.profileNamesLoaded || this.isRunningInBrowser) {
			return false;
		}
		const profileNameTrim = (separation.profile || '').trim();
		if (!profileNameTrim || profileNameTrim === 'Unknown Profile') {
			return false;
		}
		return !this.profileNamesFromSettings.some((n) => n === profileNameTrim);
	}

	/**
	 * True when the separation's profile has NO ink information in profile_ink_exceptions.json (the ink
	 * Excel has not been imported for that profile). Used to warn and to disable Generate Separations.
	 */
	isInkInfoMissingForProfile(separation: Separation): boolean {
		if (!this.inkInfoProfilesLoaded || this.isRunningInBrowser) {
			return false;
		}
		const profileNameTrim = (separation.profile || '').trim();
		if (!profileNameTrim || profileNameTrim === 'Unknown Profile') {
			return false;
		}
		/* Don't stack with the "profile missing from settings" message. */
		if (this.isProfileMissingInSettings(separation)) {
			return false;
		}
		const nameUpper = profileNameTrim.toUpperCase();
		const code = String(this.profileNameToCode[nameUpper] || '').trim().toUpperCase();
		const hasInkInfo =
			(!!code && this.inkInfoProfileCodes.has(code)) || this.inkInfoProfileNames.has(nameUpper);
		return !hasInkInfo;
	}

	openDocument(filePath: string): void {
		if (this.isRunningInBrowser) return;
		this.controller.openSeparationDocument(filePath);
	}

	handleDeleteAllPlates(): void {
		if (this.isRunningInBrowser) return;
		this.showDeleteAllConfirm = true;
		this.cdr.detectChanges();
	}

	cancelDeleteAllPlates(): void {
		this.showDeleteAllConfirm = false;
		this.cdr.detectChanges();
	}

	confirmDeleteAllPlates(): void {
		this.showDeleteAllConfirm = false;
		this.cdr.detectChanges();
		this.controller.deleteAllPlatesInSeparationDoc?.()
			?.then((res) => {
				if (res?.success && (window as any).__LEAP_SEPARATION_COLORS_REFRESH__) {
					(window as any).__LEAP_SEPARATION_COLORS_REFRESH__();
				}
			})
			?.catch(() => { });
	}

	handleRecreateAllPlates(): void {
		if (this.isRunningInBrowser) return;
		const meta = this.separatedDocInfo?.profileMetaData;
		const graphicName = meta?.graphicName ? String(meta.graphicName).trim() : '';
		if (!graphicName) return;
		this.showRecreateAllConfirm = true;
		this.cdr.detectChanges();
	}

	cancelRecreateAllPlates(): void {
		this.showRecreateAllConfirm = false;
		this.cdr.detectChanges();
	}

	confirmRecreateAllPlates(ev?: void | Record<string, boolean>): void {
		this.showRecreateAllConfirm = false;
		this.cdr.detectChanges();
		const meta = this.separatedDocInfo?.profileMetaData;
		const graphicName = meta?.graphicName ? String(meta.graphicName).trim() : '';
		if (!graphicName) return;

		const evRec = ev && typeof ev === 'object' ? (ev as Record<string, boolean>) : null;
		// Default to full cleanup (matching Create Separations) when no dialog state is provided.
		const cleanup = evRec
			? {
				deleteUnpaintedPaths: !!evRec['deleteUnpaintedPaths'],
				deleteLeftoverPaths: !!evRec['deleteLeftoverPaths']
			}
			: { deleteUnpaintedPaths: true, deleteLeftoverPaths: true };

		this.controller.deleteAllPlatesInSeparationDoc?.()
			?.then((delRes) => {
				if (delRes && !delRes.success) return undefined;
				return this.controller.recreatePlatesInActiveDocument?.(graphicName, cleanup);
			})
			?.then((recreateRes) => {
				if (recreateRes?.success) {
					if ((window as any).__LEAP_SEPARATION_COLORS_REFRESH__) {
						(window as any).__LEAP_SEPARATION_COLORS_REFRESH__();
					}
					if ((window as any).__LEAP_TAB_NAVIGATION__?.navigateToTab) {
						(window as any).__LEAP_TAB_NAVIGATION__.navigateToTab(2);
					}
				}
			})
			?.catch(() => { });
	}

	getCurrentSepGraphicName(): string {
		const name = this.separatedDocInfo?.profileMetaData?.graphicName;
		return name && name.trim() ? name.trim() : '';
	}

	getCurrentSepArtistDisplay(): string {
		const meta = this.separatedDocInfo?.profileMetaData;
		if (!meta) return '';
		const name = meta.artistName && String(meta.artistName).trim() ? String(meta.artistName).trim() : '';
		const initials = meta.artistInitials && String(meta.artistInitials).trim() ? String(meta.artistInitials).trim() : '';
		return name || initials || '';
	}

	getCurrentSepGeneratedLine(): string {
		const meta = this.separatedDocInfo?.profileMetaData;
		if (!meta) return '';
		const created = meta.createdDate;
		if (!created) return '';
		try {
			const d = new Date(created);
			if (isNaN(d.getTime())) return '';
			/* mm/dd/yyyy, matching the [DATE] token written into the separated document. */
			const dateStr = d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
			const timeStr = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
			const by = meta.artistInitials && meta.artistInitials.trim() ? meta.artistInitials.trim() : '';
			return by ? `${dateStr} at ${timeStr} by ${by}` : `${dateStr} at ${timeStr}`;
		} catch {
			return '';
		}
	}

	getSeparationPath(separation: Separation, graphicName: string): string | null {
		if (!graphicName || !separation.profile) {
			return null;
		}
		const profileName = separation.profile || '';
		const compositeKey = `${graphicName}_${profileName}`;
		let separationPath = this.separationPaths[compositeKey] || null;

		if (!separationPath) {
			const graphicKeys = Object.keys(this.separationPaths);
			const matchingKey = graphicKeys.find((key) => {
				const keyLower = key.toLowerCase();
				const compositeLower = compositeKey.toLowerCase();
				return keyLower === compositeLower;
			});
			if (matchingKey) {
				separationPath = this.separationPaths[matchingKey];
			}
		}

		return separationPath;
	}

	toggleGraphic(graphic: string): void {
		if (this.expandedGraphics.has(graphic)) {
			this.expandedGraphics.delete(graphic);
		} else {
			this.expandedGraphics.add(graphic);
		}
	}

	isGraphicExpanded(graphic: string): boolean {
		return this.expandedGraphics.has(graphic);
	}
}
