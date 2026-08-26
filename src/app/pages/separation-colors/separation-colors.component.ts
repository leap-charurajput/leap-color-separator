import { CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';
import {
	AfterViewInit,
	ChangeDetectorRef,
	Component,
	Input,
	NgZone,
	OnChanges,
	OnDestroy,
	OnInit,
	SimpleChanges
} from '@angular/core';
import { checkForJSXUpdates } from '../../../libs/helper';
import { ConfirmDialogCheckboxOption } from '../../components/confirm-dialog/confirm-dialog.component';
import { ExportResultFile } from '../../components/export-results-modal/export-results-modal.component';
import { ControllerService } from '../../services/controller.service';
import { DataIssuesService } from '../../services/data-issues.service';
import { LeapSepsLogService } from '../../services/leap-seps-log.service';
import { roiLogEvent } from '../../services/roi';

interface ColorRow {
	id: number;
	colorName: string;
	/** SEPARATED_ART sublayer / document swatch name when it differs from formal colorName (XMP swatchName). */
	swatchName?: string;
	/**
	 * SEPARATED_ART sublayer name reported by getGraphicSwatches. Used to classify a plate as
	 * White UB / Blocker for grouping even when its displayed swatch name differs (e.g. a
	 * "White UB 2" plate backed by a shared "PANTONE White C" swatch).
	 */
	layerName?: string;
	/** True when getGraphicSwatches flagged this plate as an underbase pass (standard or custom-named). */
	isUnderbase?: boolean;
	/** 1-based underbase pass number (from XMP / "White UB N"), used to order underbase plates. */
	underbasePass?: number;
	/** True when this is a real ink plate that also serves as underbase (shared swatch): group up top but keep the ink mesh. */
	underbaseSharedInk?: boolean;
	mesh: string;
	micron: string;
	type: 'separation' | 'compound';
	layerColor?: string;
	colorIcon?: any;
	flashEnabled: boolean;
	coolEnabled: boolean;
	wbEnabled: boolean;
	removed: boolean;
	components?: string[];
	specialInk?: boolean;
	specialInkValue?: string;
	generateChoke?: boolean;
	chokeColor?: string;
}

@Component({
	selector: 'app-separation-colors',
	templateUrl: './separation-colors.component.html',
	styleUrls: ['./separation-colors.component.css']
})
export class SeparationColorsComponent implements OnInit, OnChanges, AfterViewInit, OnDestroy {
	@Input() documentRefreshKey = 0;

	isRunningInBrowser = false;
	selectedGraphic = '';
	graphicOptions: string[] = [];
	isLoadingGraphics = false;
	isLoadingSwatches = false;
	isSeparatedDoc = false;
	/* Two-stage: active doc is a SEP doc prepared (art placed) but not generated yet. */
	isPreparedNotGenerated = false;
	graphicNameFromPath = '';
	graphicSwatches: any[] = [];
	// draggedIndex removed as it is handled by CDK

	graphicMenuItems = ['Add separation color', 'Add compound plate', 'Revert', 'Refresh list'];
	underbaseMenuItems = [
		'Generate Underbase from Existing Inks',
		'Delete UB, choke and blocker plates'
	];

	colorRows: ColorRow[] = [];
	nextId = 3;
	hasUIChanges = false;
	/**
	 * True when Illustrator's swatch list changed externally (e.g. user merged/renamed/deleted
	 * a swatch in the Swatches panel) so the plate list may be out of sync. Drives the same
	 * warning triangle on the Refresh button as hasUIChanges. Cleared on the next refresh/reload.
	 */
	swatchesOutOfSync = false;
	/** Ignore SWATCH_LIST_CHANGED events fired by our own swatch operations until this timestamp (ms). */
	private suppressSwatchWarnUntil = 0;
	/** AIEventAdapter listener handle, removed on destroy. */
	private swatchListChangedHandler: ((evt: any) => void) | null = null;
	/** Event types the handler is registered for (SWATCH_LIST_CHANGED + …_INTERNALLY). */
	private swatchListChangedEventTypes: string[] = [];
	/** Resolved AIEventAdapter instance (global may be bare, not on window) — kept for removal. */
	private swatchListAdapter: any = null;
	/** Snapshot of per-plate grid values carried over across a refresh-triggered reload. */
	private carryOverRowValues: { [normName: string]: Partial<ColorRow> } | null = null;
	documentProfileMetadata: any = null;
	/** Saved LEAPSeparationColorsData rows — merged into layer-based rows for mesh/flash metadata. */
	private xmpColorDataForMerge: any[] | null = null;
	bodyColorFromDocument: string | null = null;
	bodyColorNameFromDocument: string = '';

	isSeparationModalOpen = false;
	isCompoundModalOpen = false;
	isExportModalOpen = false;
	/* Per-ink second-hit mesh from Inks.xlsx "WUB Mesh 2" (key: normalized ink name). Empty = same as first hit. */
	private secondHitMeshByInk = new Map<string, string>();
	/* Export-results modal: shown after an export run with a link per exported file. */
	isExportResultsModalOpen = false;
	exportResultFiles: ExportResultFile[] = [];
	/* Guards the results modal so it opens exactly once per export run. */
	private exportResultsShown = false;
	exportPostscriptReady = true;
	exportPostscriptIssues: Array<{ id: string; message: string }> = [];
	isAddSelectionInkConfirmOpen = false;
	selectedInkForAdd: string | null = null;
	isRemoveColorDialogOpen = false;
	removeColorTargetRowId: number | null = null;
	removeColorDialogInkLabel = '';
	removeColorCheckboxOptions: ConfirmDialogCheckboxOption[] = [
		{ id: 'removeSublayer', label: 'Also remove sublayer' },
		{ id: 'removeSwatch', label: 'Also remove swatch' }
	];
	showRegenerateUnderbaseConfirm = false;
	showDeleteUbChokeBlockerConfirm = false;
	regenerateUnderbaseCheckboxOptions: ConfirmDialogCheckboxOption[] = [
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
	editingRow: ColorRow | null = null;

	editingMeshRows = new Set<number>();
	selectedMeshRows = new Set<number>();
	meshEditValue = '';
	focusedMeshRowId: number | null = null;
	private isSavingMesh = false;
	private isTypingMesh = false;

	// Visibility state for dimming icons
	visibilityMode: 'allVisible' | 'singleVisible' | 'noneVisible' | 'other' = 'allVisible';
	activeSingleInk: string | null = null;

	constructor(
		private controller: ControllerService,
		private cdr: ChangeDetectorRef,
		private ngZone: NgZone,
		private dataIssues: DataIssuesService,
		private leapSepsLog: LeapSepsLogService
	) {
		this.isRunningInBrowser = !(window as any).__adobe_cep__ && !(window as any).leap;
		// Don't initialize with default rows - wait for actual data from document
		this.colorRows = [];
	}

	ngOnInit(): void {
		this.checkIfSeparatedDocument();
		this.registerGlobalRefreshFunction();
		this.registerSwatchListChangedListener();
	}

	/**
	 * Subscribe to Illustrator's "AI Swatch List Changed Notifier" via the CEP host adapter
	 * (AIEventAdapter, loaded globally from libs/cs_host_adapter-2.0.js). When the user changes
	 * swatches in the Swatches panel (merge, rename, delete, add), mark the plate list as out of
	 * sync so the Refresh button shows its warning triangle. We do NOT auto-rebuild — the user
	 * clicks Refresh to re-fetch. Events caused by our own swatch operations are suppressed via
	 * suppressSwatchWarnUntil so the warning doesn't light up spuriously.
	 */
	private registerSwatchListChangedListener(): void {
		if (this.isRunningInBrowser) {
			return;
		}
		try {
			// cs_host_adapter-2.0.js declares `AIEventAdapter` / `AIEvent` as plain top-level function
			// declarations. Depending on how the scripts bundle is evaluated they may be reachable as a
			// *bare global* rather than a `window` property, so resolve BOTH ways: window first, then an
			// indirect-eval lookup that runs in true global scope (index.html CSP allows 'unsafe-eval').
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
			if (!AIEventAdapterRef || !AIEventRef || typeof AIEventAdapterRef.getInstance !== 'function') {
				console.warn('[SEPARATION] AIEventAdapter unavailable; swatch-change detection disabled');
				return;
			}
			// Merges/edits in the Swatches panel fire the *Internally* variant, so subscribe to both.
			const eventTypes = [AIEventRef.SWATCH_LIST_CHANGED, AIEventRef.SWATCH_LIST_CHANGED_INTERNALLY];
			const handler = (_evt: any) => {
				// Ignore events triggered by our own separation / refresh / table operations.
				if (Date.now() < this.suppressSwatchWarnUntil || this.isLoadingSwatches) {
					return;
				}
				// Only meaningful once a plate list is showing for a separated document.
				if (!this.isSeparatedDoc || this.colorRows.length === 0) {
					return;
				}
				this.ngZone.run(() => {
					if (!this.swatchesOutOfSync) {
						this.swatchesOutOfSync = true;
						this.cdr.detectChanges();
					}
				});
			};
			const adapter = AIEventAdapterRef.getInstance();
			for (const eventType of eventTypes) {
				adapter.addEventListener(eventType, handler);
			}
			this.swatchListAdapter = adapter;
			this.swatchListChangedHandler = handler;
			this.swatchListChangedEventTypes = eventTypes;
			console.log('[SEPARATION] Subscribed to swatch events:', eventTypes.join(', '));
		} catch (err) {
			console.warn('[SEPARATION] Failed to subscribe to swatch events:', err);
		}
	}

	private unregisterSwatchListChangedListener(): void {
		try {
			const adapter = this.swatchListAdapter;
			if (
				adapter &&
				this.swatchListChangedHandler &&
				this.swatchListChangedEventTypes.length &&
				typeof adapter.removeEventListener === 'function'
			) {
				for (const eventType of this.swatchListChangedEventTypes) {
					adapter.removeEventListener(eventType, this.swatchListChangedHandler);
				}
			}
		} catch (err) {
			/* no-op */
		}
		this.swatchListAdapter = null;
		this.swatchListChangedHandler = null;
		this.swatchListChangedEventTypes = [];
	}

	/** Suppress self-induced swatch-change warnings for a short window around our own ops. */
	private beginInternalSwatchOp(windowMs = 2500): void {
		this.suppressSwatchWarnUntil = Date.now() + windowMs;
	}

	/** Normalized key for matching a plate by name across a reload (case/space-insensitive). */
	private normalizePlateKey(name: string): string {
		return String(name || '').replace(/\s+/g, ' ').trim().toLowerCase();
	}

	/**
	 * Overlay carried-over per-plate grid values (captured before a refresh reload) onto the
	 * freshly rebuilt rows, matched by plate name. Surviving plates keep their panel-only grid
	 * values (mesh/micron/flash/cool/wb) and removed state; plates whose swatch was removed simply
	 * aren't in `rows`, so they drop. One-shot: the snapshot is consumed after use.
	 *
	 * NOTE: `layerColor` is deliberately NOT carried over. The plate color is owned by the
	 * document swatch (resolved fresh in `row.layerColor` via getGraphicSwatches on every reload),
	 * so carrying over the pre-refresh color would freeze it and hide a CMYK change the user just
	 * made to the swatch in Illustrator. Always take the freshly-resolved document color instead.
	 */
	private applyCarryOverRowValues(rows: ColorRow[]): ColorRow[] {
		const carry = this.carryOverRowValues;
		this.carryOverRowValues = null;
		if (!carry) {
			return rows;
		}
		return rows.map((row) => {
			const prev = carry[this.normalizePlateKey(row.colorName)];
			if (!prev) {
				return row;
			}
			return {
				...row,
				mesh: prev.mesh != null ? prev.mesh : row.mesh,
				micron: prev.micron != null ? prev.micron : row.micron,
				flashEnabled: prev.flashEnabled != null ? prev.flashEnabled : row.flashEnabled,
				coolEnabled: prev.coolEnabled != null ? prev.coolEnabled : row.coolEnabled,
				wbEnabled: prev.wbEnabled != null ? prev.wbEnabled : row.wbEnabled,
				/*
				 * layerColor intentionally omitted here so the freshly-resolved swatch color (row.layerColor)
				 * wins — this is what lets a CMYK edit in the Swatches panel show up after Refresh.
				 */
				// Preserve removed state so a reload doesn't resurrect a plate the user removed.
				removed: prev.removed != null ? prev.removed : row.removed
			};
		});
	}

	ngAfterViewInit(): void {
		// Data loading is handled in checkIfSeparatedDocument
	}

	ngOnChanges(changes: SimpleChanges): void {
		if (changes['documentRefreshKey'] && !changes['documentRefreshKey'].firstChange) {
			console.log('[SEPARATION] Refresh triggered by App (refreshKey changed)');
			checkForJSXUpdates((window as any).location.origin).then((res) => {
				console.log('check update status ref', res);
			});
			// Reset state when document changes
			this.colorRows = [];
			this.graphicSwatches = [];

			if (this.refreshCheckTimeoutId != null) {
				clearTimeout(this.refreshCheckTimeoutId);
			}
			this.refreshCheckTimeoutId = setTimeout(() => {
				this.refreshCheckTimeoutId = null;
				this.checkIfSeparatedDocument();
			}, 250);
		}
	}

	private refreshCheckTimeoutId: ReturnType<typeof setTimeout> | null = null;

	ngOnDestroy(): void {
		if (this.refreshCheckTimeoutId != null) {
			clearTimeout(this.refreshCheckTimeoutId);
			this.refreshCheckTimeoutId = null;
		}
		this.unregisterSwatchListChangedListener();
		delete (window as any).__LEAP_SEPARATION_COLORS_REFRESH__;
	}

	private initializeColorRows(): void {
		this.colorRows = [
			{
				id: 1,
				colorName: 'SL White UB',
				mesh: '110',
				micron: 'NA',
				type: 'separation',
				layerColor: '#FF6B6B',
				flashEnabled: true,
				coolEnabled: false,
				wbEnabled: true,
				removed: false
			},
			{
				id: 2,
				colorName: 'White UB',
				mesh: '157',
				micron: 'NA',
				type: 'compound',
				components: ['AMARILLO 78H', 'Bicoastal 3CC'],
				layerColor: '#E8D5C4',
				flashEnabled: true,
				coolEnabled: true,
				wbEnabled: false,
				specialInk: true,
				specialInkValue: 'foil',
				generateChoke: true,
				chokeColor: 'AMARILLO 78H',
				removed: false
			}
		];
	}

	private getRandomColor(): string {
		const colors = [
			'#FF6B6B',
			'#4ECDC4',
			'#45B7D1',
			'#FFA07A',
			'#98D8C8',
			'#F7DC6F',
			'#BB8FCE',
			'#85C1E2'
		];
		return colors[Math.floor(Math.random() * colors.length)];
	}

	loadGraphicsList(): void {
		console.log('[SEPARATION] Loading graphics list...');
		this.isLoadingGraphics = true;

		this.controller
			.getGraphicsList()
			.then((result) => {
				if (result.success && result.graphics && Array.isArray(result.graphics)) {
					console.log('[SEPARATION] Graphics loaded:', result.graphics);
					this.graphicOptions = result.graphics;
					if (!this.selectedGraphic && result.graphics.length > 0) {
						this.selectedGraphic = result.graphics[0];
					}
				} else {
					console.error('[SEPARATION] Failed to load graphics:', result.error || 'Invalid response');
					this.graphicOptions = [];
				}
			})
			.catch((err) => {
				console.error('[SEPARATION] Error loading graphics:', err);
				this.graphicOptions = [];
			})
			.finally(() => {
				this.isLoadingGraphics = false;
			});
	}

	loadGraphicSwatches(): void {
		if (!this.selectedGraphic) {
			return;
		}

		console.log('[SEPARATION] Loading swatches for graphic:', this.selectedGraphic);
		this.isLoadingSwatches = true;

		this.controller
			.getGraphicSwatches(this.selectedGraphic)
			.then((result) => {
				if (result.success && result.swatches && Array.isArray(result.swatches)) {
					console.log('[SEPARATION] Swatches loaded:', result.swatches);
					this.graphicSwatches = result.swatches;

					const newColorRows = result.swatches.map((swatchData: any, index: number) => {
						const colorHex = swatchData.hex || this.getRandomColor();
						return {
							id: index + 1,
							colorName: swatchData.name,
							mesh: '110',
							micron: 'NA',
							type: 'separation' as const,
							layerColor: colorHex,
							flashEnabled: true,
							coolEnabled: false,
							wbEnabled: true,
							removed: false
						};
					});

					this.colorRows = newColorRows;
					this.nextId = newColorRows.length + 1;
				} else {
					console.error('[SEPARATION] Failed to load swatches:', result.error);
					this.graphicSwatches = [];
				}
			})
			.catch((err) => {
				console.error('[SEPARATION] Error loading swatches:', err);
				this.graphicSwatches = [];
			})
			.finally(() => {
				this.isLoadingSwatches = false;
			});
	}

	checkIfSeparatedDocument(): void {
		console.log('[SEPARATION] Checking if document is separated...');

		this.controller
			.checkSeparatedDocument()
			.then((result) => {
				this.ngZone.run(() => {
					console.log('[SEPARATION] ========================================');
					console.log('[SEPARATION] checkSeparatedDocument - Complete Result:');
					console.log('[SEPARATION] ========================================');
					console.log('[SEPARATION] Full result object:', JSON.stringify(result.data, null, 2));
					console.log('[SEPARATION] result.success:', result.success);

					if (!result.success || !result.data || !result.data.hasDocument) {
						console.log('[SEPARATION] No data structure found or request failed');
						this.setUIForNonSeparatedDocument();
						return;
					}

					const data = result.data;

					/*
					 * Two-stage: a PREPARED SEP document has no plates yet — showing it here as a separated
					 * document would render an empty plate list. Treat it as not-yet-separated and tell the
					 * user where to go; the Separations tab carries the Generate button.
					 */
					this.isPreparedNotGenerated = data.isSeparatedDoc && String(data.separationStatus || '') === 'preparedForSeps';
					if (this.isPreparedNotGenerated) {
						this.setUIForNonSeparatedDocument();
						return;
					}

					if (data.isSeparatedDoc) {
						this.isSeparatedDoc = true;
						const bodyColorData = data.bodyColor;
						this.bodyColorFromDocument =
							bodyColorData && (bodyColorData as any).bodyColor ? (bodyColorData as any).bodyColor : null;
						this.bodyColorNameFromDocument =
							bodyColorData && (bodyColorData as any).colorName ? (bodyColorData as any).colorName : '';
						if (data.profileMetaData) {
							console.log('[SEPARATION] Setting profile metadata from XMP:', data.profileMetaData);
							const profileMetaData = data.profileMetaData;
							const existingStyleInfo = profileMetaData.styleInfo;
							const styleCodes = profileMetaData.styleCodes;

							if (existingStyleInfo) {
								console.log('[SEPARATION] Using existing styleInfo from XMP');
								this.documentProfileMetadata = profileMetaData;
							} else if (
								styleCodes &&
								Array.isArray(styleCodes) &&
								styleCodes.length > 0 &&
								this.controller.getStyleInformation
							) {
								console.log('[SEPARATION] Fetching styleInfo for styleCodes:', styleCodes);
								this.documentProfileMetadata = profileMetaData;
								this.controller
									.getStyleInformation(styleCodes)
									.then((styleInfoResult: any) => {
										console.log('[SEPARATION] getStyleInformation result:', styleInfoResult);
										this.ngZone.run(() => {
											if (styleInfoResult && styleInfoResult.success && styleInfoResult.styleInfoMap) {
												const firstStyleCode = styleCodes[0];
												const styleInfo = styleInfoResult.styleInfoMap[firstStyleCode] || null;
												console.log('[SEPARATION] Merged styleInfo for', firstStyleCode, ':', styleInfo);
												this.documentProfileMetadata = styleInfo
													? { ...profileMetaData, styleInfo }
													: profileMetaData;
											} else {
												console.warn(
													'[SEPARATION] getStyleInformation: no success or styleInfoMap',
													styleInfoResult
												);
											}
											this.cdr.detectChanges();
										});
									})
									.catch((err: any) => {
										console.error('[SEPARATION] getStyleInformation failed:', err);
										this.ngZone.run(() => this.cdr.detectChanges());
									});
							} else {
								console.log(
									'[SEPARATION] Skip getStyleInformation: styleCodes=',
									styleCodes,
									'hasGetStyleInfo=',
									!!this.controller.getStyleInformation
								);
								this.documentProfileMetadata = profileMetaData;
							}

							this.selectedGraphic = profileMetaData.graphicName || '';
							this.graphicNameFromPath = profileMetaData.graphicName || '';

							setTimeout(() => {
								this.handleRefreshList();
								this.hasUIChanges = false;
							}, 500);
						} else {
							console.log('[SEPARATION] No profile metadata found in XMP');
							this.documentProfileMetadata = null;
							this.selectedGraphic = data.graphicName || '';
							this.graphicNameFromPath = data.graphicName || '';
						}

						const separatedLayerNames = data.separatedLayerNames;
						const hasSeparatedLayerNames =
							separatedLayerNames &&
							Array.isArray(separatedLayerNames) &&
							separatedLayerNames.length > 0;
						const xmpColorData =
							data.leapSeparationColorsData &&
								Array.isArray(data.leapSeparationColorsData) &&
								data.leapSeparationColorsData.length > 0
								? data.leapSeparationColorsData
								: null;
						this.xmpColorDataForMerge = xmpColorData;

						// SeparatedLayerNames is authoritative for which plates exist (includes ink "… 2" second hits).
						// LEAPSeparationColorsData may be stale template/SEP TABLE data and must not hide new layers.
						if (hasSeparatedLayerNames) {
							console.log(
								'[SEPARATION] Loading from SeparatedLayerNames (' +
								separatedLayerNames.length +
								' layers)' +
								(xmpColorData ? ', merging XMP row metadata' : '')
							);
							this.isLoadingSwatches = true;
							this.loadColorRowsFromSeparatedLayerNames();
						} else if (xmpColorData) {
							console.log(
								'[SEPARATION] Found LEAPSeparationColorsData in XMP (no SeparatedLayerNames):',
								xmpColorData.length,
								'rows'
							);
							this.isLoadingSwatches = true;
							this.colorRows = [];
							const colorRowsFromXMP = this.convertXMPDataToColorRows(xmpColorData);
							if (colorRowsFromXMP && colorRowsFromXMP.length > 0) {
								this.colorRows = colorRowsFromXMP;
								this.nextId = colorRowsFromXMP.length + 1;
								this.hasUIChanges = false;
								this.isLoadingSwatches = false;
								this.cdr.detectChanges();
								console.log(
									'[SEPARATION] Loaded color rows from XMP data on document check:',
									colorRowsFromXMP.length,
									'rows'
								);
							} else {
								console.log('[SEPARATION] Failed to convert XMP color data');
								this.colorRows = [];
								this.isLoadingSwatches = false;
							}
						} else {
							console.log('[SEPARATION] No SeparatedLayerNames or LEAPSeparationColorsData found');
							this.colorRows = [];
							this.isLoadingSwatches = false;
							this.cdr.detectChanges();
						}
					} else {
						this.isSeparatedDoc = false;
						this.cdr.detectChanges();
						this.setUIForNonSeparatedDocument();
					}
				});
			})
			.catch((err) => {
				console.error('[SEPARATION] Error checking separated document:', err);
				this.isSeparatedDoc = false;
				this.cdr.detectChanges(); // Force change detection
				this.setUIForNonSeparatedDocument();
			});
	}

	private setUIForNonSeparatedDocument(): void {
		this.isSeparatedDoc = false;
		this.graphicNameFromPath = '';
		this.documentProfileMetadata = null;
		this.xmpColorDataForMerge = null;
		this.bodyColorFromDocument = null;
		this.bodyColorNameFromDocument = '';
		this.colorRows = [];
		this.graphicSwatches = [];
		this.selectedGraphic = '';
		this.isLoadingSwatches = false;
		this.loadGraphicsList();
	}

	/************************************************************************************************************
	 * Register global refresh function (called from other components)
	 ************************************************************************************************************/
	private registerGlobalRefreshFunction(): void {
		(window as any).__LEAP_SEPARATION_COLORS_REFRESH__ = () => {
			setTimeout(() => {
				this.checkIfSeparatedDocument();
			}, 500);
		};
	}

	convertXMPDataToColorRows(xmpData: any[]): ColorRow[] | null {
		if (!xmpData || !Array.isArray(xmpData) || xmpData.length === 0) {
			return null;
		}

		console.log(
			'[SEPARATION] Converting XMP data directly (with hex stored):',
			xmpData.length,
			'rows'
		);

		let currentId = 1;
		const newColorRows: ColorRow[] = [];

		xmpData.forEach((sepData: any) => {
			if (!sepData || !sepData.colorName) {
				return;
			}

			const colorHex = sepData.hex || this.getRandomColor();
			const isWhiteUBColor = this.isWhiteUB(sepData.colorName);
			const isCompound = sepData.type === 'compound';

			const sw =
				sepData.swatchName && String(sepData.swatchName).trim() !== ''
					? String(sepData.swatchName).trim()
					: undefined;
			const row: ColorRow = {
				id: currentId++,
				colorName: sepData.colorName,
				swatchName: sw && sw !== sepData.colorName ? sw : undefined,
				mesh: sepData.mesh || '110',
				micron: sepData.micron || 'NA',
				type: sepData.type || 'separation',
				layerColor: colorHex,
				flashEnabled: sepData.flash !== undefined ? sepData.flash : true,
				coolEnabled: sepData.cool !== undefined ? sepData.cool : false,
				wbEnabled: sepData.wb !== undefined ? sepData.wb : true,
				removed: false,
				components: sepData.components || (isCompound ? [] : undefined)
			};

			newColorRows.push(row);
		});

		return this.sortColorRowsWithWhiteUBAtBottom(newColorRows);
	}

	loadColorRowsFromSeparatedLayerNames(): Promise<void> {
		if (this.isRunningInBrowser || !this.selectedGraphic) {
			return Promise.resolve();
		}

		console.log(
			'[SEPARATION] Loading color rows using SeparatedLayerNames + Excel for graphic:',
			this.selectedGraphic
		);
		// Re-reading swatches can itself perturb the swatch list; suppress self-induced warnings.
		this.beginInternalSwatchOp();
		this.isLoadingSwatches = true;
		let allSwatchesFromDoc: any[] = [];

		return this.controller
			.getGraphicSwatches(this.selectedGraphic)
			.then((result) => {
				if (result.success && result.swatches && Array.isArray(result.swatches)) {
					allSwatchesFromDoc = result.swatches;
					console.log(
						'[SEPARATION] Fetched swatches from SeparatedLayerNames:',
						allSwatchesFromDoc.map((s: any) => s.name)
					);

					const validSwatches = this.filterPlatesForUi(allSwatchesFromDoc);
					console.log(
						'[SEPARATION] Valid swatches (exist in document):',
						validSwatches.map((s: any) => s.name)
					);

					this.graphicSwatches = validSwatches;

					// Step 2: Get ink names for batch lookup (only from valid swatches)
					const inkNames = validSwatches.map((s: any) => s.name);

					const profileName = this.documentProfileMetadata
						? this.documentProfileMetadata.profileName
						: null;
					const profileCode = this.documentProfileMetadata
						? this.documentProfileMetadata.profileCode
						: null;

					// Inks.xlsx + profile_ink_exceptions.json (hits/mesh overrides by profileCode)
					return this.controller.getInkInformationBatch(inkNames, profileName, profileCode);
				} else {
					console.error(
						'[SEPARATION] Failed to load swatches from SeparatedLayerNames:',
						result.error || 'Invalid response'
					);
					if (this.loadColorRowsFromXmpFallback('getGraphicSwatches failed')) {
						return null;
					}
					this.graphicSwatches = [];
					this.colorRows = [];
					this.isLoadingSwatches = false;
					this.cdr.detectChanges(); // Force change detection on error
					return null;
				}
			})
			.then((inkResult) => {
				if (!inkResult || !inkResult.success || !inkResult.inkInfoList) {
					console.warn('[SEPARATION] Failed to load ink information, using default mesh values');
					this.createColorRowsFromSwatchesWithDefaults();
					this.cdr.detectChanges(); // Force change detection after creating default rows
					this.pushTotalColorsToDocument(); // keep [C#] / TOTAL COLORS in sync with the Plates UI
					return;
				}

				const needsFallbackProfile = inkResult.inkInfoList.some((ink: any) => !ink.found);
				let fallbackProfilePromise: Promise<any> = Promise.resolve(null);

				if (needsFallbackProfile && this.documentProfileMetadata) {
					// Use profileCode if available, otherwise fallback to profileName
					const profileCode =
						this.documentProfileMetadata.profileCode || this.documentProfileMetadata.profileName;
					if (profileCode) {
						const meta: any = this.documentProfileMetadata;
						const distressOpt =
							meta.distress !== undefined && meta.distress !== null
								? meta.distress
								: meta.profileDistress;
						const profileOptions =
							distressOpt !== undefined && distressOpt !== null ? { distress: distressOpt } : undefined;
						fallbackProfilePromise = this.controller.getProfileInformation(profileCode, profileOptions);
					}
				}

				return fallbackProfilePromise.then((fallbackProfileResult: any) => {
					const fallbackProfile =
						fallbackProfileResult &&
							fallbackProfileResult.success &&
							fallbackProfileResult.profileInfo &&
							fallbackProfileResult.profileInfo.found
							? fallbackProfileResult.profileInfo
							: null;

					// Step 4: Convert swatches to color rows with mesh values and profile settings
					let currentId = 1;
					let newColorRows: ColorRow[] = [];

					/* Rebuild the per-ink second-hit mesh map (from Inks.xlsx "WUB Mesh 2") for this load. */
					this.secondHitMeshByInk = new Map<string, string>();

					this.graphicSwatches.forEach((swatchData: any, index: number) => {
						const inkInfo = inkResult.inkInfoList[index] || { mesh: '110', twoHits: false, found: false };
						const secondHitMesh = inkInfo.mesh2 != null ? String(inkInfo.mesh2).trim() : '';
						if (secondHitMesh) {
							this.secondHitMeshByInk.set(this.inkNameKey(swatchData.name), secondHitMesh);
						}
						const firstRow = this.createColorRowFromSwatch(
							swatchData,
							inkInfo,
							fallbackProfile,
							currentId++
						);
						newColorRows.push(firstRow);

						// Ink exceptions may flag twoHits, but performSeparation can already create "… 2" plates.
						// Skip synthetic rows when this swatch is already a hit plate or the second hit exists.
						if (
							inkInfo.twoHits &&
							!this.isInkHitPlateName(swatchData.name) &&
							!this.secondHitLayerExists(swatchData.name, this.graphicSwatches)
						) {
							const secondRow: ColorRow = {
								...firstRow,
								id: currentId++,
								colorName: `${swatchData.name} 2`,
								/* Second hit uses the Inks.xlsx "WUB Mesh 2" value when present, else the first hit's mesh. */
								mesh: this.secondHitMeshOrFallback(swatchData.name, firstRow.mesh)
							};
							newColorRows.push(secondRow);
						}
					});

					const withMissingHits = this.appendMissingSecondHitRowsFromLayers(
						newColorRows,
						allSwatchesFromDoc,
						currentId
					);
					newColorRows = withMissingHits.rows;
					currentId = withMissingHits.nextId;

					/*
					 * Normalize every second-hit ("… 2") plate's mesh in one place: the Inks.xlsx "WUB Mesh 2"
					 * value wins, otherwise it matches the first hit's mesh. This also corrects a real "… 2"
					 * plate that was loaded as its own swatch (it would otherwise inherit the base ink's
					 * exception/profile mesh instead of "WUB Mesh 2").
					 */
					newColorRows = this.applySecondHitMeshRule(newColorRows);

					const mergedColorRows = this.mergeXmpMetadataIntoColorRows(newColorRows);
					// On a refresh-triggered reload, keep each surviving plate's current grid values
					// (mesh/micron/flash/cool/wb/color) so a swatch merge doesn't reset the plates that
					// remain. Plates whose swatch was removed simply don't appear here, so they drop.
					const carriedColorRows = this.applyCarryOverRowValues(mergedColorRows);
					const sortedColorRows = this.sortColorRowsWithWhiteUBAtBottom(carriedColorRows);
					console.log(
						'[SEPARATION] Color rows loaded from SeparatedLayerNames + Excel:',
						sortedColorRows.length,
						'rows'
					);
					console.log(
						'[SEPARATION] Color rows after sorting:',
						sortedColorRows.map((r) => r.colorName)
					);
					this.colorRows = sortedColorRows;
					this.nextId = currentId;
					this.isLoadingSwatches = false;
					this.cdr.detectChanges(); // Force change detection after loading color rows
					this.pushTotalColorsToDocument(); // keep [C#] / TOTAL COLORS in sync with the Plates UI
					console.log('[SEPARATION] Color rows array:', this.colorRows);
					console.log('[SEPARATION] isLoadingSwatches:', this.isLoadingSwatches);
					console.log('[SEPARATION] isSeparatedDoc:', this.isSeparatedDoc);
					console.log(
						'[SEPARATION] Should show table?',
						!this.isLoadingSwatches &&
						(this.isSeparatedDoc || (!this.isLoadingGraphics && this.graphicOptions.length > 0))
					);
				});
			})
			.catch((err) => {
				console.error('[SEPARATION] Error loading color rows from SeparatedLayerNames + Excel:', err);
				if (!this.loadColorRowsFromXmpFallback('loadColorRowsFromSeparatedLayerNames error')) {
					this.graphicSwatches = [];
					this.colorRows = [];
					this.isLoadingSwatches = false;
					this.cdr.detectChanges(); // Force change detection on error
				}
			});
	}

	/** Use LEAPSeparationColorsData from XMP when swatch resolution fails (e.g. doc moved off 09 SEPARATIONS). */
	private loadColorRowsFromXmpFallback(reason: string): boolean {
		const xmpData = this.xmpColorDataForMerge;
		if (!xmpData || !xmpData.length) {
			return false;
		}

		console.warn(
			'[SEPARATION] Falling back to LEAPSeparationColorsData from XMP:',
			reason
		);
		const colorRowsFromXMP = this.convertXMPDataToColorRows(xmpData);
		if (!colorRowsFromXMP || colorRowsFromXMP.length === 0) {
			return false;
		}

		this.colorRows = colorRowsFromXMP;
		this.nextId = colorRowsFromXMP.length + 1;
		this.hasUIChanges = false;
		this.isLoadingSwatches = false;
		this.cdr.detectChanges();
		return true;
	}

	private filterValidSwatches(swatches: any[]): any[] {
		return swatches.filter((swatch) => {
			const name = String(swatch?.name || '').trim();
			const hasValidColor = swatch.cmyk !== null || swatch.rgb !== null;
			if (hasValidColor) {
				return true;
			}

			// Ink second-hit layers (e.g. "PANTONE 125 C 2") must stay visible even when swatch color
			// cannot be resolved yet — inherit display color from the base ink plate when possible.
			if (name && this.isInkHitPlateName(name)) {
				const baseName = name.replace(/\s+\d+$/, '').trim();
				const baseSwatch = swatches.find(
					(s) => (s?.name || '').trim().toLowerCase() === baseName.toLowerCase()
				);
				if (baseSwatch) {
					if (baseSwatch.hex) swatch.hex = baseSwatch.hex;
					if (baseSwatch.cmyk) swatch.cmyk = baseSwatch.cmyk;
					if (baseSwatch.rgb) swatch.rgb = baseSwatch.rgb;
				}
				return true;
			}

			console.log(
				`[SEPARATION] Filtering out swatch "${name}" - not found in document (no CMYK/RGB data)`
			);
			return false;
		});
	}

	private getUnderbase2SwatchNameFromMetadata(): string {
		const meta = this.documentProfileMetadata || {};
		if (meta.underbase2Swatch != null && String(meta.underbase2Swatch).trim() !== '') {
			return String(meta.underbase2Swatch).trim();
		}
		return '';
	}

	private getWhiteUbPassNumber(colorName: string): number {
		const match = String(colorName || '').trim().match(/^white\s*ub(?:\s+(\d+))?$/i);
		if (!match) return 0;
		return match[1] ? parseInt(match[1], 10) : 1;
	}

	private getProfileUnderbasePassCount(): number {
		const meta = this.documentProfileMetadata || {};
		const isEnabled = (value: any): boolean => {
			if (value === true) return true;
			if (typeof value === 'string') {
				const v = value.trim().toUpperCase();
				return v === 'Y' || v === 'YES' || v === 'TRUE' || v === '1';
			}
			return value === 1;
		};
		const enabled = Array.isArray(meta.underbaseEnabled) ? meta.underbaseEnabled : [];
		if (enabled.length > 0) {
			let count = enabled[0] !== false ? 1 : 0;
			for (let i = 1; i < Math.min(4, enabled.length); i++) {
				if (enabled[i] === true) count = i + 1;
			}
			return Math.max(1, Math.min(4, count));
		}
		const ub4 = isEnabled(meta.underbase4Enabled) || isEnabled(meta.ub4Enabled) || isEnabled(meta.underbase4) || isEnabled(meta['Underbase 4']);
		const ub3 = isEnabled(meta.underbase3Enabled) || isEnabled(meta.ub3Enabled) || isEnabled(meta.underbase3) || isEnabled(meta['Underbase 3']);
		const ub2 = isEnabled(meta.underbase2Enabled) || isEnabled(meta.ub2Enabled) || isEnabled(meta.underbase2) || isEnabled(meta['Underbase 2']);
		if (ub4) return 4;
		if (ub3) return 3;
		if (ub2) return 2;
		return 1;
	}

	private filterPlatesForUi(swatches: any[]): any[] {
		return this.filterValidSwatches(swatches);
	}

	private createColorRowFromSwatch(
		swatchData: any,
		inkInfo: any,
		fallbackProfile: any,
		currentId: number
	): ColorRow {
		const colorHex = swatchData.hex || this.getRandomColor();
		/*
		 * Classify by the SEPARATED_ART layer identity (falls back to the display name) so a
		 * White UB / Blocker plate backed by a shared or renamed swatch is still recognized.
		 */
		const plateIdentity = this.swatchPlateIdentity(swatchData);
		/* Underbase flag/pass come from getGraphicSwatches (XMP-backed) so custom-named passes count too. */
		const swatchIsUnderbase = swatchData.isUnderbase === true;
		const swatchUbPass =
			swatchData.underbasePass != null && !isNaN(parseInt(swatchData.underbasePass, 10))
				? parseInt(swatchData.underbasePass, 10)
				: 0;
		const swatchSharedInk = swatchData.underbaseSharedInk === true;
		const isWhiteUBColor = swatchIsUnderbase || this.isWhiteUB(plateIdentity);
		const isBlockerColor = this.isBlocker(plateIdentity);

		// Determine which profile to use
		let profileInfo: any = {};
		let hasProfile = false;

		if (inkInfo.found && inkInfo.profileInfo && inkInfo.profileInfo.found) {
			// Primary: profile resolved alongside the ink (from Profiles.json via the exception lookup)
			profileInfo = inkInfo.profileInfo;
			hasProfile = true;
		} else if (!inkInfo.found && fallbackProfile) {
			// Fallback: Use profile from document XMP
			profileInfo = fallbackProfile;
			hasProfile = true;
		}

		// Use profile values if available, otherwise use defaults
		const flashEnabled = hasProfile ? profileInfo.flash : true;
		const coolEnabled = hasProfile ? profileInfo.cool : false;
		const wbEnabled = hasProfile ? profileInfo.wb : true;
		const micron = hasProfile ? profileInfo.micron : 'NA';
		const profileColorMesh = this.getProfileColorMesh(profileInfo);
		const profileBlockerMesh = this.getProfileBlockerMesh(profileInfo);
		const underbaseMeshes = this.getProfileUnderbaseMeshes();
		let meshValue = inkInfo.mesh || '110';
		if (isWhiteUBColor && !swatchSharedInk) {
			const ubPass = swatchUbPass > 0 ? swatchUbPass : this.getWhiteUbPassNumber(plateIdentity);
			const meshFromProfile = ubPass > 0 ? underbaseMeshes[ubPass - 1] : '';
			meshValue = meshFromProfile || inkInfo.mesh || '110';
		} else if (
			inkInfo.source === 'inkException' &&
			inkInfo.mesh != null &&
			String(inkInfo.mesh).trim() !== ''
		) {
			/*
			 * An ink-exception mesh (from profile_ink_exceptions.json) is an explicit per-ink override
			 * and must win over the profile's default Color Mesh. This covers the first hit and any
			 * "… 2" hit plate that still resolves to the same exception (e.g. "LS 1235" / "LS 1235 2"
			 * with an exception mesh of 110 instead of the profile Color Mesh).
			 */
			meshValue = String(inkInfo.mesh).trim();
		} else if (isBlockerColor && profileBlockerMesh !== '') {
			meshValue = profileBlockerMesh;
		} else if (profileColorMesh !== '') {
			meshValue = profileColorMesh;
		}

		return {
			id: currentId,
			colorName: swatchData.name,
			layerName: this.normalizeLayerName(swatchData.layerName),
			isUnderbase: swatchIsUnderbase || undefined,
			underbasePass: swatchUbPass > 0 ? swatchUbPass : undefined,
			underbaseSharedInk: swatchSharedInk || undefined,
			mesh: meshValue,
			micron: micron,
			type: 'separation',
			layerColor: colorHex,
			flashEnabled: flashEnabled,
			coolEnabled: coolEnabled,
			wbEnabled: wbEnabled,
			removed: false
		};
	}

	private createColorRowsFromSwatchesWithDefaults(): void {
		const profileColorMesh = this.getProfileColorMesh();
		const profileBlockerMesh = this.getProfileBlockerMesh();
		const newColorRows: ColorRow[] = this.graphicSwatches.map((swatchData: any, index: number) => {
			const colorHex = swatchData.hex || this.getRandomColor();
			const plateIdentity = this.swatchPlateIdentity(swatchData);
			const swatchIsUnderbase = swatchData.isUnderbase === true;
			const swatchUbPass =
				swatchData.underbasePass != null && !isNaN(parseInt(swatchData.underbasePass, 10))
					? parseInt(swatchData.underbasePass, 10)
					: 0;
			const swatchSharedInk = swatchData.underbaseSharedInk === true;
			const isWhiteUBColor = swatchIsUnderbase || this.isWhiteUB(plateIdentity);
			const isBlockerColor = this.isBlocker(plateIdentity);
			let meshValue = '110';
			/* Shared-ink underbase keeps its ink mesh (treated as an ink for mesh, underbase only for grouping). */
			if (!isWhiteUBColor || swatchSharedInk) {
				if (isBlockerColor && profileBlockerMesh !== '') {
					meshValue = profileBlockerMesh;
				} else if (profileColorMesh !== '') {
					meshValue = profileColorMesh;
				}
			}
			return {
				id: index + 1,
				colorName: swatchData.name,
				layerName: this.normalizeLayerName(swatchData.layerName),
				isUnderbase: swatchIsUnderbase || undefined,
				underbasePass: swatchUbPass > 0 ? swatchUbPass : undefined,
				underbaseSharedInk: swatchSharedInk || undefined,
				mesh: meshValue,
				micron: 'NA',
				type: 'separation',
				layerColor: colorHex,
				flashEnabled: true,
				coolEnabled: false,
				wbEnabled: true,
				removed: false
			};
		});

		const sortedColorRows = this.sortColorRowsWithWhiteUBAtBottom(newColorRows);
		console.log(
			'[SEPARATION] Color rows after sorting (fallback):',
			sortedColorRows.map((r) => r.colorName)
		);
		this.colorRows = sortedColorRows;
		this.nextId = sortedColorRows.length + 1;
		this.isLoadingSwatches = false;
		this.cdr.detectChanges(); // Force change detection after creating default rows
	}

	private sortColorRowsWithWhiteUBAtBottom(rows: ColorRow[]): ColorRow[] {
		if (!rows || rows.length === 0) return rows;

		// Print order: Blocker first, then White UB rows (1, 2, 3…), then other inks. Stable within each group.
		// Classification uses the SEPARATED_ART layer identity (layerName) when present so a White UB /
		// Blocker plate shown under a shared or renamed swatch name is still grouped correctly.
		const rank = (row: ColorRow): number => {
			const identity = this.plateIdentityName(row);
			if (this.isBlocker(identity)) return 0;
			if (row.isUnderbase || this.isWhiteUB(identity)) return 1;
			return 2;
		};
		/* Underbase pass index: prefer the XMP-backed pass (handles custom names), else parse the name. */
		const passIndex = (row: ColorRow): number =>
			row.underbasePass && row.underbasePass > 0
				? row.underbasePass
				: this.getWhiteUbPassIndex(this.plateIdentityName(row));

		return rows
			.map((row, index) => ({ row, index }))
			.sort((a, b) => {
				const ra = rank(a.row);
				const rb = rank(b.row);
				if (ra !== rb) return ra - rb;
				if (ra === 1) {
					const pa = passIndex(a.row);
					const pb = passIndex(b.row);
					if (pa !== pb) return pa - pb;
				}
				return a.index - b.index;
			})
			.map((x) => x.row);
	}

	/*
	 * The name used to classify a plate's group (Blocker / White UB / ink). Prefers the stable
	 * SEPARATED_ART layer name from getGraphicSwatches, falling back to the displayed color name.
	 */
	private plateIdentityName(row: ColorRow): string {
		const layer = row.layerName && String(row.layerName).trim();
		return layer || String(row.colorName || '').trim();
	}

	/* Same identity resolution for a raw getGraphicSwatches entry (layerName, else name). */
	private swatchPlateIdentity(swatchData: any): string {
		const layer = swatchData && swatchData.layerName != null ? String(swatchData.layerName).trim() : '';
		return layer || String((swatchData && swatchData.name) || '').trim();
	}

	/* Normalize a raw layerName value to a trimmed string or undefined (kept off the row when absent). */
	private normalizeLayerName(layerName: any): string | undefined {
		const value = layerName != null ? String(layerName).trim() : '';
		return value || undefined;
	}

	/* Normalized key for matching an ink name in the second-hit mesh map. */
	private inkNameKey(name: string): string {
		return String(name || '').trim().toLowerCase();
	}

	/*
	 * Mesh to use for a second hit: the Inks.xlsx "WUB Mesh 2" value for the base ink when present,
	 * otherwise the provided fallback (the first hit's mesh).
	 */
	private secondHitMeshOrFallback(baseInkName: string, fallbackMesh: string): string {
		const key = this.inkNameKey(baseInkName);
		const mesh2 = key ? this.secondHitMeshByInk.get(key) : '';
		return mesh2 && String(mesh2).trim() !== '' ? String(mesh2).trim() : fallbackMesh;
	}

	/*
	 * Apply the second-hit mesh rule to every "… 2" hit plate regardless of how the row was created
	 * (synthetic Two-Hits row, appended-from-layer, manual add, or a real "… 2" swatch loaded through
	 * createColorRowFromSwatch): the Inks.xlsx "WUB Mesh 2" value for the base ink wins; when there is
	 * no "WUB Mesh 2", the second hit keeps the first hit's mesh. Any later user edit saved to XMP still
	 * overrides this via mergeXmpMetadataIntoColorRows, which runs after this pass.
	 */
	private applySecondHitMeshRule(rows: ColorRow[]): ColorRow[] {
		/* Diagnostic: what "WUB Mesh 2" values were captured from Inks.xlsx for this load. */
		try {
			const mapDump: { [k: string]: string } = {};
			this.secondHitMeshByInk.forEach((v, k) => (mapDump[k] = v));
			console.log('[SECOND_HIT_MESH] secondHitMeshByInk map:', mapDump);
		} catch (e) { }
		return rows.map((row) => {
			const name = (row.colorName || '').trim();
			if (!this.isInkHitPlateName(name)) {
				return row;
			}
			const baseName = name.replace(/\s+\d+$/, '').trim();
			const baseRow = rows.find(
				(r) => (r.colorName || '').trim().toLowerCase() === baseName.toLowerCase()
			);
			const fallbackMesh = baseRow && baseRow.mesh != null ? baseRow.mesh : row.mesh;
			const resolvedMesh = this.secondHitMeshOrFallback(baseName, fallbackMesh);
			console.log(
				'[SECOND_HIT_MESH] hit plate:', name,
				'| base:', baseName,
				'| firstHitMesh:', fallbackMesh,
				'| mapValue:', this.secondHitMeshByInk.get(this.inkNameKey(baseName)) || '(none)',
				'| resolved:', resolvedMesh
			);
			return resolvedMesh === row.mesh ? row : { ...row, mesh: resolvedMesh };
		});
	}

	private getWhiteUbPassIndex(colorName: string): number {
		if (!colorName) return 999;
		const lower = String(colorName).trim().toLowerCase();
		if (lower === 'white ub') return 1;
		const match = lower.match(/^white ub\s+(\d+)$/);
		return match ? parseInt(match[1], 10) : 999;
	}

	isWhiteUB(colorName: string): boolean {
		if (!colorName) return false;
		const lowerName = colorName.toLowerCase();
		return lowerName.includes('white ub') || lowerName.includes('whiteub');
	}

	private getSwatchHexByName(name: string): string | undefined {
		const key = (name || '').trim().toLowerCase();
		if (!key) {
			return undefined;
		}
		const swatch = this.graphicSwatches.find(
			(s: any) => (s?.name || '').trim().toLowerCase() === key
		);
		const hex = swatch?.hex;
		return hex && String(hex).trim() !== '' ? String(hex).trim() : undefined;
	}

	isBlocker(colorName: string): boolean {
		if (!colorName) return false;
		const t = String(colorName).trim().toLowerCase();
		return t === 'blocker' || /^blocker\s+\d+$/.test(t);
	}

	isUnderbaseRow(row: ColorRow): boolean {
		return this.isBlocker(row.colorName) || this.isWhiteUB(row.colorName);
	}

	/** True on the last underbase row when the next row is an ink color. */
	isUnderbaseInkDivider(index: number): boolean {
		const rows = this.colorRows;
		if (index < 0 || index >= rows.length - 1) {
			return false;
		}
		return this.isUnderbaseRow(rows[index]) && !this.isUnderbaseRow(rows[index + 1]);
	}

	/** Illustrator SEPARATED_ART sublayer name (XMP swatchName when it differs from formal colorName). */
	hostLayerName(row: ColorRow): string {
		const s = row.swatchName && String(row.swatchName).trim();
		return (s || row.colorName || '').trim();
	}

	/**
	 * Names to try when deleting SEPARATED_ART sublayer / swatch (exact match only in host).
	 * Table label first (e.g. second hit "LS 186 2"), then document swatch name if different — never fuzzy-map to another ink.
	 */
	private inkDeletionTryNames(row: ColorRow): string[] {
		const seen = new Set<string>();
		const out: string[] = [];
		const push = (raw: string) => {
			const t = (raw || '').trim();
			if (!t) return;
			const k = t.toLowerCase();
			if (seen.has(k)) return;
			seen.add(k);
			out.push(t);
		};
		push(row.colorName || '');
		push(this.hostLayerName(row));
		return out;
	}

	private getProfileColorMesh(profileInfo?: any): string {
		const profileValue =
			profileInfo && profileInfo.colorMesh != null
				? profileInfo.colorMesh
				: profileInfo && profileInfo['Color Mesh'] != null
					? profileInfo['Color Mesh']
					: '';
		if (profileValue != null && String(profileValue).trim() !== '') {
			return String(profileValue).trim();
		}

		const meta = this.documentProfileMetadata || {};
		const value =
			meta.colorMesh != null
				? meta.colorMesh
				: meta['Color Mesh'] != null
					? meta['Color Mesh']
					: '';
		return value == null ? '' : String(value).trim();
	}

	private getProfileBlockerMesh(profileInfo?: any): string {
		const profileValue =
			profileInfo && profileInfo.blockerMesh != null
				? profileInfo.blockerMesh
				: profileInfo && profileInfo['Blocker Mesh'] != null
					? profileInfo['Blocker Mesh']
					: '';
		if (profileValue != null && String(profileValue).trim() !== '') {
			return String(profileValue).trim();
		}

		const meta = this.documentProfileMetadata || {};
		const value =
			meta.blockerMesh != null
				? meta.blockerMesh
				: meta['Blocker Mesh'] != null
					? meta['Blocker Mesh']
					: '';
		return value == null ? '' : String(value).trim();
	}

	private getRequiredWhiteUbCountFromProfile(): number {
		return this.getProfileUnderbasePassCount();
	}

	private getProfileUnderbaseMeshes(): string[] {
		const meta = this.documentProfileMetadata || {};
		if (Array.isArray(meta.underbaseMeshes)) {
			return meta.underbaseMeshes.map((m: any) => (m == null ? '' : String(m).trim()));
		}

		return [
			meta.ub1Mesh != null ? String(meta.ub1Mesh).trim() : '',
			meta.ub2Mesh != null ? String(meta.ub2Mesh).trim() : '',
			meta.ub3Mesh != null ? String(meta.ub3Mesh).trim() : ''
		];
	}

	private buildTableRowsWithRequiredWhiteUb(activeRows: ColorRow[]): ColorRow[] {
		const whiteRows = activeRows.filter((row) => this.isWhiteUB(row.colorName));
		if (whiteRows.length === 0) {
			return activeRows;
		}

		const requiredWhiteCount = this.getRequiredWhiteUbCountFromProfile();
		const underbaseMeshes = this.getProfileUnderbaseMeshes();
		const expandedCount = Math.max(requiredWhiteCount, whiteRows.length);

		const sortedWhiteRows = [...whiteRows].sort(
			(a, b) => this.getWhiteUbPassIndex(a.colorName) - this.getWhiteUbPassIndex(b.colorName)
		);
		const whiteTemplate = sortedWhiteRows[0];
		const baseWhiteName = (whiteTemplate.colorName || 'White UB').replace(/\s+\d+$/g, '').trim();

		/* Custom per-pass underbase names from the profile, e.g. ["SL White UB", "SL White UB 2nd", …]. */
		const profileUbNames: string[] = Array.isArray(this.documentProfileMetadata?.underbaseNames)
			? this.documentProfileMetadata.underbaseNames.map((n: any) => (n == null ? '' : String(n).trim()))
			: [];

		const expandedWhiteRows: ColorRow[] = [];
		for (let i = 0; i < expandedCount; i++) {
			const sourceRow = sortedWhiteRows[i] || whiteTemplate;
			const meshFromProfile = underbaseMeshes[i] || '';
			/*
			 * Name this pass after what the DOCUMENT actually calls it, then the profile's custom name,
			 * and only invent "<base> <n>" as a last resort.
			 *
			 * The synthesized name used to win unconditionally, which renamed a real plate out of
			 * existence: a profile with custom underbase names has pass 2 on the layer/swatch
			 * "SL White UB 2nd", and overwriting it with "SL White UB 2" left every downstream lookup
			 * hunting for a swatch that does not exist — updateGridColorLabels then found nothing, skipped
			 * the colour, and the GRID INFO BOX label kept the SEP template's [Registration] text
			 * ("Swatch 'SL White UB 2' not found for group '2'" in leap_seps.log).
			 */
			const existingName = sortedWhiteRows[i] ? this.hostLayerName(sortedWhiteRows[i]).trim() : '';
			const rowColorName =
				existingName ||
				profileUbNames[i] ||
				(i === 0 ? baseWhiteName : `${baseWhiteName} ${i + 1}`);
			const hexFromDocument = this.getSwatchHexByName(rowColorName);
			expandedWhiteRows.push({
				...sourceRow,
				colorName: rowColorName,
				/* The name above IS the document name, so no swatchName override is needed (or wanted). */
				swatchName: undefined,
				mesh: meshFromProfile || sourceRow.mesh,
				layerColor: hexFromDocument || sourceRow.layerColor
			});
		}

		const mergedRows: ColorRow[] = [];
		let hasInsertedWhiteRows = false;
		for (const row of activeRows) {
			if (this.isWhiteUB(row.colorName)) {
				if (!hasInsertedWhiteRows) {
					mergedRows.push(...expandedWhiteRows);
					hasInsertedWhiteRows = true;
				}
				continue;
			}
			mergedRows.push(row);
		}

		return hasInsertedWhiteRows ? mergedRows : [...activeRows, ...expandedWhiteRows];
	}

	handleGraphicMenuClick(item: string): void {
		console.log('[SEPARATION] Graphic menu clicked:', item);

		if (item === 'Refresh list') {
			this.handleRefreshList();
		} else if (item === 'Add separation color') {
			this.handleAddSeparationColor();
		} else if (item === 'Add compound plate') {
			this.handleAddCompoundPlate();
		} else if (item === 'Revert') {
			this.handleRevert();
		}
	}

	handleRefreshList(): void {
		// Refresh = re-fetch swatches∩layers, rebuild the plate list, then push PG Ink Data +
		// GRID DATA. Surviving plates keep their current grid values (mesh/flags/color); plates
		// whose swatch was removed/merged in the Swatches panel drop out; Choke stays out (no
		// swatch). Clears both out-of-sync warnings (unsaved grid edits + external swatch change).
		this.hasUIChanges = false;
		this.swatchesOutOfSync = false;
		this.beginInternalSwatchOp();

		if (this.isRunningInBrowser || !this.selectedGraphic) {
			this.updateSepTableInDocument();
			return;
		}

		// Snapshot current grid values so surviving plates keep them across the reload.
		this.carryOverRowValues = this.snapshotRowValues();

		this.loadColorRowsFromSeparatedLayerNames()
			.then(() => {
				this.updateSepTableInDocument();
			})
			.catch((err) => {
				console.error('[SEPARATION] Refresh reload failed:', err);
				this.updateSepTableInDocument();
			});
	}

	/** Capture current per-plate grid values (incl. removed state) keyed by normalized name. */
	private snapshotRowValues(): { [normName: string]: Partial<ColorRow> } {
		const snap: { [normName: string]: Partial<ColorRow> } = {};
		for (const row of this.colorRows) {
			if (!row) {
				continue;
			}
			/*
			 * layerColor is intentionally NOT snapshotted: the plate color is owned by the document
			 * swatch and re-resolved on every reload, so a CMYK change made in the Swatches panel is
			 * reflected after Refresh (see applyCarryOverRowValues).
			 */
			snap[this.normalizePlateKey(row.colorName)] = {
				mesh: row.mesh,
				micron: row.micron,
				flashEnabled: row.flashEnabled,
				coolEnabled: row.coolEnabled,
				wbEnabled: row.wbEnabled,
				removed: row.removed
			};
		}
		return snap;
	}

	handleExportProcess(): void {
		this.controller.checkPostscriptReadiness({ requireDocument: true }).then((result: any) => {
			if (result?.success) {
				this.exportPostscriptReady = !!result.ready;
				this.exportPostscriptIssues = Array.isArray(result.issues) ? result.issues : [];
			}
			this.ngZone.run(() => {
				this.isExportModalOpen = true;
				this.cdr.detectChanges();
			});
		}).catch(() => {
			this.ngZone.run(() => {
				this.isExportModalOpen = true;
				this.cdr.detectChanges();
			});
		});
	}

	handleExportModalClose(): void {
		// ← Add this new method
		this.ngZone.run(() => {
			this.isExportModalOpen = false;
			this.cdr.detectChanges();
		});
	}

	handleExportSeparations(exportOptions: any): void {
		const controlNumber = (exportOptions && exportOptions.controlNumber ? String(exportOptions.controlNumber) : '').trim();
		const versionNumber = (exportOptions && exportOptions.versionNumber ? String(exportOptions.versionNumber) : '').trim();

		// Control number + Version number are required (the Export button is gated on both). Write them into
		// the document's [CONTROL]/[V#] tokens (first export) or the Control_Number/Version_Number text frames
		// (repeat export) and SAVE FIRST, then continue to the PostScript/Print-Guide export. Never blocks the
		// export on an update failure (it's logged; the export still runs).
		this.controller
			.updateControlAndVersionNumbers(controlNumber, versionNumber)
			.then((res: any) => {
				if (!res || res.success !== true) {
					console.error('[SEPARATION] Control/Version number update failed:', res && res.error ? res.error : 'unknown error');
				}
			})
			.catch((err: any) => {
				console.error('[SEPARATION] Control/Version number update error:', err && (err.message || err.reason) ? (err.message || err.reason) : err);
			})
			.then(() => this.runExports(exportOptions));
	}

	private runExports(exportOptions: any): void {
		console.log('[SEPARATION] Starting export process...');

		/* Reset the results collection + modal for this fresh export run. */
		this.exportResultFiles = [];
		this.exportResultsShown = false;
		this.isExportResultsModalOpen = false;

		/*
		 * Always copy the separation .ai file to the "Separation file path" first,
		 * independent of the export checkboxes. Running it before any PDF saveAs keeps
		 * the copy pointing at the on-disk .ai. Best-effort: logged, never blocks the
		 * Print Guide / PostScript exports, which run once the copy settles.
		 */
		this.controller
			.copySeparationFile()
			.then((res: any) => {
				if (res && res.success) {
					if (!res.skipped) {
						console.log('[SEPARATION] Separation file copied → ' + (res.filePath || ''));
						this.pushExportResultFile('Separation File (.ai)', res.filePath);
					}
				} else {
					console.error('[SEPARATION] Separation file copy failed: ' + (res && res.error ? res.error : 'unknown error'));
				}
			})
			.catch((err: any) => {
				console.error(
					'[SEPARATION] Separation file copy error: ' +
					(err && (err.message || err.reason) ? (err.message || err.reason) : err)
				);
			})
			.then(() => this.runPdfAndPostscriptExports(exportOptions));
	}

	/*
	 * Runs the Print Guide PDF and PostScript (+ Seps Preview PDF) exports per the
	 * selected checkboxes. Split out from runExports so the always-on separation .ai
	 * copy can complete first.
	 */
	private runPdfAndPostscriptExports(exportOptions: any): void {
		const exportResults: string[] = [];
		const exportErrors: string[] = [];

		// Export Print Guide PDF
		if (exportOptions.exportPrintGuide) {
			this.controller
				.exportPrintGuidePDF()
				.then((result) => {
					if (result && result.success) {
						exportResults.push('Print Guide PDF');
						this.pushExportResultFile('Print Guide PDF', result.filePath);
					} else {
						exportErrors.push('Print Guide PDF: ' + (result?.error || 'Failed'));
					}
					return this.checkExportCompletion(exportOptions, exportResults, exportErrors);
				})
				.catch((err) => {
					exportErrors.push('Print Guide PDF: ' + (err.message || err.reason || 'Unknown error'));
					return this.checkExportCompletion(exportOptions, exportResults, exportErrors);
				});
		} else {
			this.checkExportCompletion(exportOptions, exportResults, exportErrors);
		}

		const postscriptDelay = exportOptions.exportPrintGuide ? 500 : 0;

		// Postscript export: .ps and the distilled Seps Preview .pdf both land in the postscriptFilePath folder
		if (exportOptions.exportPostscript) {
			const postscriptInks = this.getPostscriptInks();
			setTimeout(() => {
				this.controller
					.exportPostscript(postscriptInks)
					.then(async (psResult) => {
						const label = 'Postscript and Seps Preview';
						if (!psResult?.success || !psResult?.filePath) {
							exportErrors.push(label + ': ' + (psResult?.error || 'PostScript export failed'));
							this.checkExportCompletion(exportOptions, exportResults, exportErrors);
							return;
						}

						/* .ps landed in the Postscript folder — link it in the results modal. */
						this.pushExportResultFile('PostScript (.ps)', psResult.filePath);

						try {
							const distillResult = await this.controller.distillSeparationsPreviewPDF(psResult.filePath);
							if (distillResult && distillResult.success) {
								exportResults.push(label);
								/* Distilled Seps Preview PDF (beside the .ps) — link it too. */
								this.pushExportResultFile('Seps Preview PDF', distillResult.filePath);
								// ROI: one sepexport event per completed separation output (see services/roi.ts; never throws)
								roiLogEvent({
									action: 'sepexport',
									doc: this.selectedGraphic || this.graphicNameFromPath || '',
									artboards: postscriptInks.length,
									elements: { SpotColors: postscriptInks.length, Separations: postscriptInks.length }
								});
							} else {
								exportErrors.push(label + ': ' + (distillResult?.error || 'Distiller failed'));
							}
						} catch (err: any) {
							exportErrors.push(label + ': ' + (err?.message || err?.reason || 'Unknown error'));
						}

						this.checkExportCompletion(exportOptions, exportResults, exportErrors);
					})
					.catch((err) => {
						exportErrors.push(
							'Postscript and Seps Preview: ' + (err.message || err.reason || 'Unknown error')
						);
						this.checkExportCompletion(exportOptions, exportResults, exportErrors);
					});
			}, postscriptDelay);

			this.ngZone.run(() => {
				this.isExportModalOpen = false;
				this.cdr.detectChanges();
			});
		}
	}

	private checkExportCompletion(
		exportOptions: any,
		exportResults: string[],
		exportErrors: string[]
	): void {
		const totalExports =
			(exportOptions.exportPrintGuide ? 1 : 0) + (exportOptions.exportPostscript ? 1 : 0);

		if (exportResults.length + exportErrors.length >= totalExports) {
			if (exportErrors.length > 0 && exportResults.length === 0) {
				console.error('[SEPARATION] Export failed: ' + exportErrors[0]);
			} else if (exportErrors.length > 0) {
				console.warn(`[SEPARATION] ${exportResults.length} exported, ${exportErrors.length} failed`);
			} else if (exportResults.length > 0) {
				const successMessage =
					exportResults.length === 1
						? `${exportResults[0]} exported successfully!`
						: `Exported ${exportResults.length} files successfully!`;
				console.log('[SEPARATION]', successMessage);
			}

			/*
			 * The whole export run is done — show the results modal once with a link per
			 * exported file (Separation .ai, Print Guide, .ps, Seps Preview PDF).
			 */
			this.openExportResultsModal();
		}
	}

	/*
	 * Record an exported file for the results modal. De-dupes by absolute path and
	 * derives the display name from the path. Ignores empty paths.
	 */
	private pushExportResultFile(label: string, filePath: string | undefined | null): void {
		const path = String(filePath || '').trim();
		if (!path) return;
		if (this.exportResultFiles.some((file) => file.path === path)) return;
		const name = path.split(/[\\/]/).pop() || path;
		this.exportResultFiles.push({ label, path, name });
		/*
		 * One "[EXPORT] <label> -> <full path>" line per exported file, as the MESSAGE (details get
		 * truncated). This is the single chokepoint every export result passes through, so Print Guide,
		 * PostScript and the Distiller PDF are all recorded the same way — a path mismatch between two
		 * machines is then a grep away instead of a guess.
		 */
		this.leapSepsLog.logInfo('EXPORT', label + ' -> ' + path);
	}

	/* Open the export-results modal exactly once per export run (inside the zone). */
	private openExportResultsModal(): void {
		if (this.exportResultsShown) return;
		this.exportResultsShown = true;
		this.ngZone.run(() => {
			this.isExportResultsModalOpen = true;
			this.cdr.detectChanges();
		});
	}

	handleExportResultsModalClose(): void {
		this.ngZone.run(() => {
			this.isExportResultsModalOpen = false;
			this.cdr.detectChanges();
		});
	}

	handleRevealExportFile(filePath: string): void {
		const result = this.controller.revealFileInFinder(filePath);
		if (!result.success) {
			console.error('[SEPARATION] Reveal in Finder failed: ' + (result.error || 'unknown error'));
		}
	}

	handleAddUnderbase(): void {
		this.handleAddCompoundPlate();
	}

	handleUnderbaseMenuClick(item: string): void {
		if (item === 'Generate Underbase from Existing Inks') {
			this.handleGenerateUnderbaseFromExistingInks();
		} else if (item === 'Delete UB, choke and blocker plates') {
			this.handleDeleteUbChokeBlockerPlates();
		}
	}

	/*
	 * Push the Plates-UI total color count to the document's [C#] / "TOTAL COLORS" text frames.
	 * The count is every non-removed plate the Plates UI shows (ink colors + White UB underbase
	 * passes + Blocker) — NOT the raw SEPARATED_ART layer count — so the sheet's total matches what
	 * the user sees, including after "Generate underbase from existing inks" and after removing a color.
	 */
	private pushTotalColorsToDocument(): void {
		if (this.isRunningInBrowser || !this.isSeparatedDoc) {
			return;
		}
		const count = this.colorRows.filter((row) => !row.removed).length;
		this.controller
			.updateTotalColors?.(count)
			?.catch((err: any) => {
				console.error('[SEPARATION] updateTotalColors failed:', err?.message || err);
			});
	}

	handleGenerateUnderbaseFromExistingInks(): void {
		if (this.isRunningInBrowser) return;
		this.showRegenerateUnderbaseConfirm = true;
		this.cdr.detectChanges();
	}

	cancelGenerateUnderbaseFromExistingInks(): void {
		this.showRegenerateUnderbaseConfirm = false;
		this.cdr.detectChanges();
	}

	confirmGenerateUnderbaseFromExistingInks(ev?: void | Record<string, boolean>): void {
		this.showRegenerateUnderbaseConfirm = false;
		this.cdr.detectChanges();

		const evRec = ev && typeof ev === 'object' ? (ev as Record<string, boolean>) : null;
		const cleanup = evRec
			? {
				deleteUnpaintedPaths: !!evRec['deleteUnpaintedPaths'],
				deleteLeftoverPaths: !!evRec['deleteLeftoverPaths']
			}
			: { deleteUnpaintedPaths: true, deleteLeftoverPaths: true };

		this.controller
			.regenerateUnderbaseFromExistingInks?.(cleanup)
			?.then((res) => {
				if (res?.success) {
					this.checkIfSeparatedDocument();
				} else if (res?.error) {
					/* Log + banner, no modal alert (same policy as the Separations tab failures). */
					this.leapSepsLog.logError('SeparationColors', res.error);
					this.dataIssues.report('underbase-regenerate', 'Recreate underbase failed: ' + res.error);
				}
			})
			?.catch((err) => {
				this.leapSepsLog.logError('SeparationColors', err);
				this.dataIssues.report('underbase-regenerate', 'Recreate underbase failed: ' + (err?.message || String(err)));
			});
	}

	handleDeleteUbChokeBlockerPlates(): void {
		if (this.isRunningInBrowser) return;
		this.showDeleteUbChokeBlockerConfirm = true;
		this.cdr.detectChanges();
	}

	cancelDeleteUbChokeBlockerPlates(): void {
		this.showDeleteUbChokeBlockerConfirm = false;
		this.cdr.detectChanges();
	}

	confirmDeleteUbChokeBlockerPlates(): void {
		this.showDeleteUbChokeBlockerConfirm = false;
		this.cdr.detectChanges();
		this.controller.deleteUbChokeBlockerArtInSeparationDoc?.()
			?.then((res) => {
				if (res?.success) {
					this.checkIfSeparatedDocument();
				} else if (res?.error) {
					this.leapSepsLog.logError('SeparationColors', res.error);
					this.dataIssues.report('plates-delete', 'Delete plates failed: ' + res.error);
				}
			})
			?.catch((err) => {
				this.leapSepsLog.logError('SeparationColors', err);
				this.dataIssues.report('plates-delete', 'Delete plates failed: ' + (err?.message || String(err)));
			});
	}

	handleAddSelectionToSeparation(): void {
		this.controller
			.inspectSelectionForSeparationInk()
			.then((result) => {
				this.ngZone.run(() => {
					if (!result?.success) {
						this.showAddInkAlert(result?.message || 'Unable to inspect selection');
						return;
					}

					if (!result.canAdd) {
						if (result.reason === 'mixed-spot-fill' || result.reason === 'no-spot-fill') {
							this.showAddInkAlert('Select objects with same fill spot color to add to separation');
							return;
						}
						if (result.reason === 'no-selection') {
							this.showAddInkAlert('Select at least one object first');
							return;
						}
						if (result.reason === 'already-exists') {
							this.showAddInkAlert(result.message || 'Ink already exists in separation');
							return;
						}
						this.showAddInkAlert(result.message || 'Cannot add selection to separation');
						return;
					}

					this.selectedInkForAdd = result.swatchName || null;
					if (!this.selectedInkForAdd) {
						this.showAddInkAlert('Unable to determine fill swatch from selection');
						return;
					}
					this.isAddSelectionInkConfirmOpen = true;
					this.cdr.detectChanges();
				});
			})
			.catch((err) => {
				console.error('[SEPARATION] Failed to inspect selection for adding ink:', err);
				this.showAddInkAlert('Failed to inspect selection');
			});
	}

	handleCancelAddSelectionInk(): void {
		this.isAddSelectionInkConfirmOpen = false;
		this.selectedInkForAdd = null;
		this.cdr.detectChanges();
	}

	handleConfirmAddSelectionInk(): void {
		const inkName = (this.selectedInkForAdd || '').trim();
		if (!inkName) {
			this.handleCancelAddSelectionInk();
			return;
		}

		// Close confirm modal immediately on user action.
		this.isAddSelectionInkConfirmOpen = false;
		this.cdr.detectChanges();

		this.controller
			.addSelectionToSeparationInk(inkName)
			.then((result) => {
				this.ngZone.run(() => {
					if (!result?.success) {
						this.selectedInkForAdd = null;
						this.showAddInkAlert(result?.message || 'Failed to add ink to separation');
						return;
					}

					this.addInkRowToPanel(inkName, result?.hex || null).finally(() => {
						this.updateSepTableInDocument();
						this.hasUIChanges = false;
						this.selectedInkForAdd = null;
						this.cdr.detectChanges();
					});
				});
			})
			.catch((err) => {
				console.error('[SEPARATION] Failed to add selection to separation:', err);
				this.selectedInkForAdd = null;
				this.showAddInkAlert('Failed to add ink to separation');
			});
	}

	private showAddInkAlert(message: string): void {
		const finalMessage = (message || '').trim() || 'Something went wrong';
		this.controller.showHostAlert('Add Ink to Separation', finalMessage).catch((err) => {
			console.error('[SEPARATION] Failed to show host alert dialog:', err);
		});
	}

	private addInkRowToPanel(inkName: string, swatchHexFromHost?: string | null): Promise<void> {
		const normalizedInkName = inkName.trim().toLowerCase();
		const alreadyInPanel = this.colorRows.some(
			(row) => !row.removed && (row.colorName || '').trim().toLowerCase() === normalizedInkName
		);
		if (alreadyInPanel) {
			return Promise.resolve();
		}

		const swatchFromGraphic = this.graphicSwatches.find(
			(sw: any) => (sw?.name || '').trim().toLowerCase() === normalizedInkName
		);
		const colorHex =
			(swatchHexFromHost && String(swatchHexFromHost).trim()) ||
			(swatchFromGraphic && swatchFromGraphic.hex) ||
			this.getRandomColor();
		const profileName = this.documentProfileMetadata ? this.documentProfileMetadata.profileName : null;
		const profileCode = this.documentProfileMetadata ? this.documentProfileMetadata.profileCode : null;

		return this.controller
			.getInkInformationBatch([inkName], profileName, profileCode)
			.then((inkResult) => {
				this.ngZone.run(() => {
					const inkInfo =
						inkResult && inkResult.success && Array.isArray(inkResult.inkInfoList)
							? inkResult.inkInfoList[0]
							: null;
					const rowFromInkData = this.createColorRowFromSwatch(
						{ name: inkName, hex: colorHex },
						inkInfo || { mesh: '110', twoHits: false, found: false },
						null,
						this.nextId
					);
					const addInkRow = {
						...rowFromInkData,
						flashEnabled: false,
						wbEnabled: false
					};
					this.colorRows = [...this.colorRows, addInkRow];
					this.nextId++;
					this.cdr.detectChanges();
				});
			})
			.catch((_err) => {
				this.ngZone.run(() => {
					const fallbackRow: ColorRow = {
						id: this.nextId,
						colorName: inkName,
						mesh: '110',
						micron: 'NA',
						type: 'separation',
						layerColor: colorHex,
						flashEnabled: false,
						coolEnabled: false,
						wbEnabled: false,
						removed: false
					};
					this.colorRows = [...this.colorRows, fallbackRow];
					this.nextId++;
					this.cdr.detectChanges();
				});
			});
	}

	handleRevert(): void {
		console.log('[SEPARATION] Reversing color list order');
		this.colorRows = [...this.colorRows].reverse();
	}

	handleAddSeparationColor(): void {
		console.log('[SEPARATION] Opening modal to add separation color');
		this.editingRow = null;
		this.isSeparationModalOpen = true;
		this.cdr.detectChanges(); // Ensure modal opens with fresh state
	}

	handleAddCompoundPlate(): void {
		console.log('[SEPARATION] Opening modal to add compound plate');
		this.editingRow = null;
		this.isCompoundModalOpen = true;
		this.cdr.detectChanges(); // Ensure modal opens with fresh state
	}

	handleSaveSeparationColor(plateData: any): void {
		if (this.editingRow) {
			const updatedRows = this.colorRows.map((row) =>
				row.id === this.editingRow!.id
					? {
						...row,
						colorName: plateData.colorName,
						mesh: plateData.mesh,
						micron: plateData.micron,
						flashEnabled: plateData.flashEnabled,
						coolEnabled: plateData.coolEnabled,
						wbEnabled: plateData.wbEnabled
					}
					: row
			);
			this.colorRows = updatedRows;
			this.hasUIChanges = true;
			console.log('[SEPARATION] Separation color updated:', this.editingRow.id);
		} else {
			const randomColor = this.getRandomColor();
			const isWhiteUBColor = this.isWhiteUB(plateData.colorName);
			const newRow: ColorRow = {
				id: this.nextId,
				colorName: plateData.colorName,
				mesh: plateData.mesh,
				micron: plateData.micron,
				type: 'separation',
				layerColor: randomColor,
				flashEnabled: plateData.flashEnabled,
				coolEnabled: plateData.coolEnabled,
				wbEnabled: plateData.wbEnabled,
				removed: false
			};
			this.colorRows = [...this.colorRows, newRow];
			this.nextId++;
			this.hasUIChanges = true;
			console.log('[SEPARATION] New separation color added:', newRow);
		}
		this.isSeparationModalOpen = false;
		this.editingRow = null;
		this.cdr.detectChanges();
	}

	handleSaveCompoundPlate(plateData: any): void {
		if (this.editingRow) {
			const updatedRows = this.colorRows.map((row) =>
				row.id === this.editingRow!.id
					? {
						...row,
						colorName: plateData.colorName,
						components: plateData.components,
						mesh: plateData.mesh,
						micron: plateData.micron,
						flashEnabled: plateData.flashEnabled,
						coolEnabled: plateData.coolEnabled,
						wbEnabled: plateData.wbEnabled,
						specialInk: plateData.specialInk,
						specialInkValue: plateData.specialInkValue,
						generateChoke: plateData.generateChoke,
						chokeColor: plateData.chokeColor
					}
					: row
			);
			this.colorRows = updatedRows;
			this.hasUIChanges = true;
			console.log('[SEPARATION] Compound plate updated:', this.editingRow.id);
		} else {
			const compoundColor = '#E8D5C4';
			const newRow: ColorRow = {
				id: this.nextId,
				colorName: plateData.colorName,
				mesh: plateData.mesh,
				micron: plateData.micron,
				type: 'compound',
				components: plateData.components,
				layerColor: compoundColor,
				flashEnabled: plateData.flashEnabled,
				coolEnabled: plateData.coolEnabled,
				wbEnabled: plateData.wbEnabled,
				specialInk: plateData.specialInk,
				specialInkValue: plateData.specialInkValue,
				generateChoke: plateData.generateChoke,
				chokeColor: plateData.chokeColor,
				removed: false
			};
			this.colorRows = [newRow, ...this.colorRows];
			this.nextId++;
			this.hasUIChanges = true;
			console.log('[SEPARATION] New compound plate added:', newRow);
		}
		setTimeout(() => {
			this.hasUIChanges = false;
			this.handleRefreshList();
		}, 500);
		this.isCompoundModalOpen = false;
		this.editingRow = null;
		this.cdr.detectChanges();
	}

	getColorRowMenuItems(row: ColorRow): string[] {
		return ['Edit', `Add second hit of ${row.colorName}`, 'Remove color'];
	}

	handleColorRowMenuClick(item: string, rowId: number): void {
		console.log('[SEPARATION] Color row menu clicked:', item, 'for row:', rowId);

		if (item === 'Remove color') {
			this.openRemoveColorDialog(rowId);
		} else if (item === 'Edit') {
			this.handleEditSeparation(rowId);
		} else if (item.startsWith('Add second hit')) {
			console.log('[HIT THE DROPDOWN]', rowId);
			const menuColorName = this.extractSecondHitColorName(item);
			this.handleAddSecondHit(rowId, menuColorName);
		}
	}

	private extractSecondHitColorName(menuItem: string): string | null {
		const prefix = 'Add second hit of ';
		if (!menuItem || menuItem.indexOf(prefix) !== 0) {
			return null;
		}
		const extracted = menuItem.substring(prefix.length).trim();
		return extracted || null;
	}

	handleAddSecondHit(rowId: number, colorNameFromMenu?: string | null): void {
		let originalRow: ColorRow | undefined;
		if (colorNameFromMenu) {
			const normalizedMenuName = colorNameFromMenu.trim().toLowerCase();
			originalRow = this.colorRows.find(
				(row) =>
					!row.removed &&
					((row.colorName || '').trim().toLowerCase() === normalizedMenuName ||
						this.hostLayerName(row).toLowerCase() === normalizedMenuName)
			);
		}
		if (!originalRow) {
			originalRow = this.colorRows.find((row) => row.id === rowId);
		}
		if (!originalRow) return;

		const duplicateName = this.getUniqueSecondHitName(originalRow.colorName);

		const duplicateRow: ColorRow = {
			...originalRow,
			id: this.nextId,
			colorName: duplicateName,
			/* Second hit uses the Inks.xlsx "WUB Mesh 2" value for the base ink when present, else same mesh. */
			mesh: this.secondHitMeshOrFallback(originalRow.colorName || this.hostLayerName(originalRow), originalRow.mesh),
			/** Second hit is its own plate; do not inherit parent's XMP swatch name (would target wrong layer/swatch on remove). */
			swatchName: undefined,
			removed: false
		};

		const originalIndex = this.colorRows.findIndex((row) => row.id === rowId);
		const newColorRows = [
			...this.colorRows.slice(0, originalIndex + 1),
			duplicateRow,
			...this.colorRows.slice(originalIndex + 1)
		];

		this.colorRows = newColorRows;
		this.nextId++;
		this.hasUIChanges = true;

		//   🔥 Call Illustrator script (fire-and-forget, UI-safe)
		this.controller
			.generateUnderbaseLayer(this.hostLayerName(originalRow), duplicateName)
			.then((res: string) => {
				console.log('[SEPARATION] Second hit request:', {
					sourceColor: this.hostLayerName(originalRow!),
					duplicateColor: duplicateName,
					rowId: rowId
				});
				try {
					const parsed = res ? JSON.parse(res) : null;
					console.log('[SEPARATION] Second hit underbase response:', parsed || res);
				} catch (_e) {
					console.log('[SEPARATION] Second hit underbase created:', res);
				}
			})
			.catch((err: any) => {
				console.error('[SEPARATION] Failed to create second hit underbase', err);
			})
			.finally(() => {
				this.handleRefreshList(); // ✅ update SEP TABLE after underbase generation
				this.cdr.detectChanges();
			});
	}

	/**
	 * Second-hit names: append " 2", " 3", … to the full ink name.
	 * Exception: a single trailing digit after whitespace (e.g. "White UB 2") is treated as an
	 * existing hit index and incremented ("White UB 3"). Multi-digit suffixes like "LS 123" stay
	 * part of the name so the next hit is "LS 123 2", not "LS 124".
	 */
	getUniqueSecondHitName(currentName: string): string {
		const trimmedName = (currentName || '').trim();
		const match = trimmedName.match(/^(.+)\s+(\d+)$/);
		let baseName = trimmedName;
		let nextNumber = 2;

		if (match && match[2]) {
			const trailingDigits = match[2];
			if (trailingDigits.length === 1) {
				baseName = match[1].trim();
				nextNumber = parseInt(trailingDigits, 10) + 1;
			}
		}

		const existingNames = new Set(
			this.colorRows.map((row) => (row.colorName || '').trim().toLowerCase())
		);
		let candidate = `${baseName} ${nextNumber}`.trim();

		while (existingNames.has(candidate.toLowerCase())) {
			nextNumber += 1;
			candidate = `${baseName} ${nextNumber}`.trim();
		}

		return candidate;
	}

	handleEditSeparation(rowId: number): void {
		const rowToEdit = this.colorRows.find((row) => row.id === rowId);
		if (rowToEdit) {
			console.log('[SEPARATION] Opening modal to edit:', rowId, 'Type:', rowToEdit.type);

			// Set editingRow first, then open modal to ensure data is available
			this.editingRow = rowToEdit;
			this.cdr.detectChanges(); // Force change detection to ensure editData is set

			if (rowToEdit.type === 'compound') {
				this.isCompoundModalOpen = true;
			} else {
				this.isSeparationModalOpen = true;
			}
			this.cdr.detectChanges(); // Force change detection after opening modal
		}
	}

	private openRemoveColorDialog(rowId: number): void {
		const row = this.colorRows.find((r) => r.id === rowId);
		if (!row || row.removed) {
			return;
		}
		this.removeColorTargetRowId = rowId;
		this.removeColorDialogInkLabel = (row.colorName || '').trim() || this.hostLayerName(row);
		this.isRemoveColorDialogOpen = true;
		this.cdr.detectChanges();
	}

	handleCancelRemoveColor(): void {
		this.isRemoveColorDialogOpen = false;
		this.removeColorTargetRowId = null;
		this.removeColorDialogInkLabel = '';
		this.cdr.detectChanges();
	}

	handleConfirmRemoveColor(payload?: void | Record<string, boolean>): void {
		const rowId = this.removeColorTargetRowId;
		if (rowId == null) {
			this.handleCancelRemoveColor();
			return;
		}
		const row = this.colorRows.find((r) => r.id === rowId);
		this.isRemoveColorDialogOpen = false;
		this.removeColorTargetRowId = null;
		this.removeColorDialogInkLabel = '';
		this.cdr.detectChanges();

		const flags =
			payload && typeof payload === 'object'
				? (payload as Record<string, boolean>)
				: ({} as Record<string, boolean>);
		const removeSublayer = !!flags['removeSublayer'];
		const removeSwatch = !!flags['removeSwatch'];
		const inkDeletionTryNames = row ? this.inkDeletionTryNames(row) : [];

		const applyPanelRemove = (): void => {
			this.applyRemoveColorToPanel(rowId);
			this.updateSepTableInDocument();
			this.hasUIChanges = false;
			this.cdr.detectChanges();
			this.pushTotalColorsToDocument(); // TOTAL COLORS drops when a plate is removed
		};

		if (!this.isRunningInBrowser && inkDeletionTryNames.length > 0 && (removeSublayer || removeSwatch)) {
			this.controller
				.removeSeparationInkArtifacts(inkDeletionTryNames, removeSublayer, removeSwatch)
				.then((result) => {
					this.ngZone.run(() => {
						if (result && result.success === false && result.error) {
							console.warn('[SEPARATION] removeSeparationInkArtifacts:', result.error);
						} else {
							if (removeSublayer && result && !result.removedLayer && result.layerMessage) {
								console.warn('[SEPARATION] sublayer:', result.layerMessage);
							}
							if (removeSwatch && result && !result.removedSwatch && result.swatchMessage) {
								console.warn('[SEPARATION] swatch:', result.swatchMessage);
							}
						}
						applyPanelRemove();
					});
				})
				.catch((err) => {
					console.error('[SEPARATION] removeSeparationInkArtifacts failed', err);
					this.ngZone.run(() => applyPanelRemove());
				});
		} else {
			applyPanelRemove();
		}
	}

	private applyRemoveColorToPanel(rowId: number): void {
		const newColorRows = this.colorRows.map((r) => {
			if (r.id === rowId) {
				return { ...r, removed: true };
			}
			return r;
		});

		const sortedRows = newColorRows.sort((a, b) => {
			if (a.removed === b.removed) return 0;
			return a.removed ? 1 : -1;
		});

		this.colorRows = sortedRows;
		this.hasUIChanges = true;
		console.log('[SEPARATION] Color row removed and moved to bottom:', rowId);
	}

	handleToggleInkVisibility(colorName: string): void {
		console.log('[SEPARATION] Toggle ink visibility for:', colorName);

		this.controller
			.toggleInkVisibility(colorName)
			.then((result) => {
				if (result && result.success) {
					console.log('[SEPARATION] Ink visibility mode:', result.mode || 'n/a');
					// Update local state for UI dimming
					if (result.mode) {
						this.visibilityMode = result.mode;
						this.activeSingleInk = result.activeInk || null;
					}
					this.cdr.detectChanges();
				} else {
					console.error('[SEPARATION] Error toggling ink visibility:', result && result.error);
				}
			})
			.catch((err) => {
				console.error('[SEPARATION] Failed to toggle ink visibility:', err);
			});
	}

	isInkDimmed(colorName: string): boolean {
		if (this.visibilityMode === 'noneVisible') {
			return true;
		}
		if (this.visibilityMode === 'singleVisible' && this.activeSingleInk) {
			// Dim if this is NOT the active single ink
			return colorName !== this.activeSingleInk;
		}
		return false;
	}

	handleToggleHeaderVisibility(): void {
		console.log('[SEPARATION] Reset ink visibility from header');

		this.controller
			.resetInkVisibility()
			.then((result) => {
				if (result && result.success) {
					console.log('[SEPARATION] Ink visibility reset, mode:', result.mode || 'n/a');
					// Use returned mode (could be 'allVisible' or 'noneVisible')
					this.visibilityMode = result.mode || 'allVisible';
					this.activeSingleInk = null;
					this.cdr.detectChanges();
				} else {
					console.error('[SEPARATION] Error resetting ink visibility:', result && result.error);
				}
			})
			.catch((err) => {
				console.error('[SEPARATION] Failed to reset ink visibility:', err);
			});
	}

	// Drag and Drop (CDK)
	drop(event: CdkDragDrop<string[]>): void {
		if (event.previousIndex === event.currentIndex) {
			return;
		}

		moveItemInArray(this.colorRows, event.previousIndex, event.currentIndex);
		this.hasUIChanges = true;
		console.log(
			'[SEPARATION] Color rows reordered from index',
			event.previousIndex,
			'to',
			event.currentIndex
		);

		// In CEP, always ask Illustrator to reorder — do not gate on isSeparatedDoc (it can be false while
		// the table still shows rows). ExtendScript returns a clear error if SEPARATED_ART is missing.
		if (!this.isRunningInBrowser) {
			const orderedNames = this.colorRows
				.filter((row) => !row.removed)
				.map((row) => this.hostLayerName(row));
			this.controller
				.reorderSeparatedArtLayers(orderedNames)
				.then((result) => {
					if (result && result.success) {
						console.log('[SEPARATION] SEPARATED_ART layers reordered in document:', {
							movedCount: result.movedCount,
							isSeparatedDoc: this.isSeparatedDoc
						});
					} else {
						console.error(
							'[SEPARATION] Failed to reorder SEPARATED_ART sublayers:',
							result && result.error
						);
					}
				})
				.catch((err) => {
					console.error('[SEPARATION] reorderSeparatedArtLayers error:', err);
				});
		}
	}

	getSequenceNumber(index: number): string {
		const activeRowsBeforeThis = this.colorRows.slice(0, index).filter((row) => !row.removed).length;
		const row = this.colorRows[index];
		return row.removed ? '' : String(activeRowsBeforeThis + 1);
	}

	// Compound-plate modal component list — excludes UB. Not for PostScript export.
	getAvailableColors(): string[] {
		return this.colorRows
			.filter((row) => row.type === 'separation' && !/ub/i.test(row.colorName))
			.map((row) => this.hostLayerName(row));
	}

	// PostScript export ink list — includes White UB plates; excludes removed rows.
	getPostscriptInks(): string[] {
		return this.colorRows
			.filter((row) => row.type === 'separation' && !row.removed)
			.map((row) => this.hostLayerName(row));
	}

	isCompoundPlate(row: ColorRow): boolean {
		return row.type === 'compound';
	}

	getSeparationColor(row: ColorRow): string {
		if (row.layerColor) {
			return row.layerColor;
		}
		const fromDocument = this.getSwatchHexByName(row.colorName);
		if (fromDocument) {
			return fromDocument;
		}
		return '#FF6B6B';
	}

	// Mesh editing functionality
	handleMeshCellClick(rowId: number, event: MouseEvent): void {
		event.stopPropagation();
		const row = this.colorRows.find((r) => r.id === rowId);
		if (!row || row.removed) return;

		// 1. Check if row is already selected
		const isCurrentlySelected = this.selectedMeshRows.has(rowId);

		if (isCurrentlySelected) {
			// 2. If ALREADY selected, enter Edit Mode for ALL selected rows
			const newEditing = new Set<number>();
			this.selectedMeshRows.forEach((id) => {
				newEditing.add(id);
			});

			this.editingMeshRows = newEditing;
			// Use the clicked row's mesh as the starting value for the bulk edit
			this.meshEditValue = row.mesh || '';
			this.focusedMeshRowId = rowId;

			setTimeout(() => {
				const input = document.querySelector(`input[data-mesh-row-id="${rowId}"]`) as HTMLInputElement;
				if (input) {
					input.focus();
					const length = input.value.length;
					input.setSelectionRange(length, length);
				}
			}, 0);
		} else {
			// 3. If NOT selected, ADD to selection (Additive/Toggle behavior)
			this.selectedMeshRows.add(rowId);
			// Force new Set reference to trigger change detection if needed (though we mutated the Set above, Angular might need a new ref)
			this.selectedMeshRows = new Set(this.selectedMeshRows);

			// Ensure we are NOT in edit mode if we are just adding to selection
			this.editingMeshRows = new Set<number>();
			this.meshEditValue = '';
		}
	}

	handleMeshInputChange(value: string): void {
		this.isTypingMesh = true;
		this.meshEditValue = value;
		this.hasUIChanges = true;

		// Note: We do NOT mutate row.mesh here anymore.
		// The inputs bind to [value]="meshEditValue", so they will all update visually.
		// Committing to data model happens on Save.

		setTimeout(() => {
			this.isTypingMesh = false;
		}, 100);
	}

	handleMeshInputBlur(): void {
		// Save on blur
		// We use a small timeout to allow other events (like standard click) to process
		// But in this case, clicking outside SHOULD save.
		setTimeout(() => {
			// If we are still in edit mode (meaning we didn't cancel), save.
			if (this.editingMeshRows.size > 0 && !this.isTypingMesh && !this.isSavingMesh) {
				this.saveMeshValues();
			}
		}, 200);
	}

	handleMeshInputKeyDown(event: KeyboardEvent): void {
		if (event.key === 'Enter') {
			event.preventDefault();
			this.isTypingMesh = false;
			this.saveMeshValues();
		} else if (event.key === 'Escape') {
			event.preventDefault();
			this.isTypingMesh = false;
			this.cancelMeshEdit();
		}
	}

	private saveMeshValues(): void {
		if (this.isSavingMesh) {
			return;
		}

		if (this.editingMeshRows.size === 0) {
			return;
		}

		this.isSavingMesh = true;
		const valueToSave = this.meshEditValue.trim();

		// Update ALL rows that were being edited
		this.colorRows = this.colorRows.map((row) => {
			if (this.editingMeshRows.has(row.id)) {
				return { ...row, mesh: valueToSave };
			}
			return row;
		});

		this.hasUIChanges = true;

		// Clear editing state and selection state after save
		this.editingMeshRows = new Set<number>();
		this.selectedMeshRows = new Set<number>();
		this.meshEditValue = '';

		setTimeout(() => {
			this.isSavingMesh = false;
		}, 100);
	}

	private cancelMeshEdit(): void {
		// Just exit edit mode, maybe keep selection?
		// For now, let's clear everything to return to clean state
		this.editingMeshRows = new Set<number>();
		this.selectedMeshRows = new Set<number>();
		this.meshEditValue = '';
	}

	// Toggle functions
	handleToggleFlash(rowId: number): void {
		this.colorRows = this.colorRows.map((row) =>
			row.id === rowId ? { ...row, flashEnabled: !row.flashEnabled } : row
		);
		this.hasUIChanges = true;
		this.cdr.detectChanges();
	}

	handleToggleCool(rowId: number): void {
		this.colorRows = this.colorRows.map((row) =>
			row.id === rowId ? { ...row, coolEnabled: !row.coolEnabled } : row
		);
		this.hasUIChanges = true;
		this.cdr.detectChanges();
	}

	handleToggleWb(rowId: number): void {
		this.colorRows = this.colorRows.map((row) =>
			row.id === rowId ? { ...row, wbEnabled: !row.wbEnabled } : row
		);
		this.hasUIChanges = true;
		this.cdr.detectChanges();
	}

	isMeshEditing(rowId: number): boolean {
		return this.editingMeshRows.has(rowId);
	}

	isMeshSelected(rowId: number): boolean {
		return this.selectedMeshRows.has(rowId);
	}

	/** True when the name ends with a single-digit hit index (e.g. "PANTONE 123 C 2", "White UB 3"). */
	private isInkHitPlateName(name: string): boolean {
		const trimmed = (name || '').trim();
		const match = trimmed.match(/^(.+)\s+(\d+)$/);
		return !!(match && match[2] && match[2].length === 1);
	}

	/** True when a "baseName 2" plate already exists in the document swatch list. */
	private secondHitLayerExists(baseName: string, swatches: any[]): boolean {
		const secondHitName = `${(baseName || '').trim()} 2`;
		return swatches.some(
			(s) => (s.name || '').trim().toLowerCase() === secondHitName.toLowerCase()
		);
	}

	/** Merge mesh/flash/cool/wb from saved LEAPSeparationColorsData into layer-based rows. */
	private mergeXmpMetadataIntoColorRows(rows: ColorRow[]): ColorRow[] {
		const xmpData = this.xmpColorDataForMerge;
		if (!xmpData || xmpData.length === 0) {
			return rows;
		}

		const lookup = new Map<string, any>();
		for (const entry of xmpData) {
			if (!entry) continue;
			const names = [entry.colorName, entry.swatchName].filter(
				(n) => n != null && String(n).trim() !== ''
			);
			for (const n of names) {
				lookup.set(String(n).trim().toLowerCase(), entry);
			}
		}

		return rows.map((row) => {
			const hostKey = this.hostLayerName(row).trim().toLowerCase();
			const colorKey = (row.colorName || '').trim().toLowerCase();
			const xmp = lookup.get(hostKey) || lookup.get(colorKey);
			if (!xmp) {
				return row;
			}
			const sw =
				xmp.swatchName && String(xmp.swatchName).trim() !== '' &&
					String(xmp.swatchName).trim().toLowerCase() !== colorKey
					? String(xmp.swatchName).trim()
					: row.swatchName;
			return {
				...row,
				mesh: xmp.mesh != null ? String(xmp.mesh) : row.mesh,
				micron: xmp.micron != null ? String(xmp.micron) : row.micron,
				flashEnabled: xmp.flash !== undefined ? !!xmp.flash : row.flashEnabled,
				coolEnabled: xmp.cool !== undefined ? !!xmp.cool : row.coolEnabled,
				wbEnabled: xmp.wb !== undefined ? !!xmp.wb : row.wbEnabled,
				/*
				 * Prefer the freshly-resolved LIVE swatch color (row.layerColor) over the saved XMP hex, so a
				 * CMYK change made in the Swatches panel shows up after Refresh. The stored hex in
				 * LEAPSeparationColorsData is only a last-resort fallback for when the live color is
				 * unavailable. (Grid metadata like mesh/flash still comes from XMP above — only color is
				 * document-owned.)
				 */
				layerColor: row.layerColor || xmp.hex,
				swatchName: sw,
				type: xmp.type === 'compound' ? 'compound' : row.type
			};
		});
	}

	/** Ensure ink "… 2" layers from the document appear even if earlier steps skipped them. */
	private appendMissingSecondHitRowsFromLayers(
		rows: ColorRow[],
		allSwatches: any[],
		startId: number
	): { rows: ColorRow[]; nextId: number } {
		let nextId = startId;
		const existing = new Set(rows.map((r) => (r.colorName || '').trim().toLowerCase()));
		const merged = [...rows];

		for (const swatch of allSwatches) {
			const layerName = (swatch?.name || '').trim();
			if (!layerName || !this.isInkHitPlateName(layerName)) {
				continue;
			}
			const key = layerName.toLowerCase();
			if (existing.has(key)) {
				continue;
			}

			const baseName = layerName.replace(/\s+\d+$/, '').trim();
			const baseRow = rows.find(
				(r) => (r.colorName || '').trim().toLowerCase() === baseName.toLowerCase()
			);
			merged.push({
				id: nextId++,
				colorName: layerName,
				mesh: this.secondHitMeshOrFallback(baseName, baseRow?.mesh || '110'),
				micron: baseRow?.micron || 'NA',
				type: 'separation',
				layerColor: swatch.hex || baseRow?.layerColor || this.getRandomColor(),
				flashEnabled: baseRow?.flashEnabled ?? true,
				coolEnabled: baseRow?.coolEnabled ?? false,
				wbEnabled: baseRow?.wbEnabled ?? true,
				removed: false
			});
			existing.add(key);
		}

		return { rows: merged, nextId };
	}

	private resolveColorDisplayName(swatchName: string, format: string): string {
		const trimmed = swatchName.trim();
		if (!/^PANTONE\s/i.test(trimmed)) {
			return swatchName;
		}

		let pantoneBase = trimmed;
		let hitSuffix = '';
		const hitMatch = trimmed.match(/^(.+?)\s+(\d+)$/);
		if (hitMatch && hitMatch[2] && hitMatch[2].length === 1) {
			pantoneBase = hitMatch[1].trim();
			hitSuffix = ` ${hitMatch[2]}`;
		}

		const withoutPrefix = pantoneBase.replace(/^PANTONE\s+/i, '');
		const tokenMatch = withoutPrefix.match(/^(.*?)\s+[A-Z]{1,3}P?$/);
		const token = tokenMatch ? tokenMatch[1].trim() : withoutPrefix.trim();
		/* Substitute "###" and the LEGACY "XXX" token (older Profiles.json formats like "LS XXX C"). */
		return format.replace(/###/g, token).replace(/XXX/g, token) + hitSuffix;
	}

	updateSepTableInDocument(): void {
		// Writing the SEP table can rename/create swatches; suppress self-induced warnings.
		this.beginInternalSwatchOp();
		const activeRows = this.colorRows.filter((row) => !row.removed);

		if (activeRows.length === 0) {
			console.log('[SEPARATION] No active rows to update in SEP TABLE');
			return;
		}

		const formatEnabled = !!(this.documentProfileMetadata?.formatInkNameLabel);
		const colorNameFormat: string =
			this.documentProfileMetadata?.colorNameLabelFormat &&
				String(this.documentProfileMetadata.colorNameLabelFormat).trim() !== ''
				? String(this.documentProfileMetadata.colorNameLabelFormat)
				: 'PANTONE ### C';

		const tableRows = this.buildTableRowsWithRequiredWhiteUb(activeRows);
		const separationData = tableRows.map((row, index) => {
			const host = this.hostLayerName(row).trim();
			let colorNameOut = row.colorName;
			let swatchNameOut = host;
			let renameInkFrom: string | undefined = undefined;
			if (formatEnabled) {
				colorNameOut = this.resolveColorDisplayName(row.colorName, colorNameFormat);
				swatchNameOut = String(colorNameOut || '').trim();
				if (
					host &&
					swatchNameOut &&
					host.toLowerCase() !== swatchNameOut.toLowerCase()
				) {
					renameInkFrom = host;
				}
			}
			return {
				seq: index + 1,
				colorName: colorNameOut,
				swatchName: swatchNameOut,
				renameInkFrom,
				mesh: row.mesh,
				micron: row.micron,
				flash: row.flashEnabled,
				cool: row.coolEnabled,
				wb: row.wbEnabled,
				hex: row.layerColor || null,
				type: row.type || 'separation'
			};
		});

		console.log('[SEPARATION] Updating SEP TABLE with', separationData.length, 'rows');

		this.controller
			.updateSepTable(separationData)
			.then((result) => {
				if (result.success) {
					console.log('[SEPARATION] SEP TABLE updated successfully:', result);
					if (result.inkRenamesApplied > 0) {
						this.checkIfSeparatedDocument();
					}
				} else {
					console.error('[SEPARATION] Failed to update SEP TABLE:', result.error);
				}
			})
			.catch((err) => {
				console.error('[SEPARATION] Error updating SEP TABLE:', err);
			});
	}

	handleCancel(): void {
		// debugger;
		this.isSeparationModalOpen = false;
		this.isCompoundModalOpen = false;
		this.editingRow = null;
		this.cdr.detectChanges();
	}
}
