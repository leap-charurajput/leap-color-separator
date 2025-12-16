import { Component, Input, OnInit, OnChanges, SimpleChanges, ChangeDetectorRef, AfterViewInit, OnDestroy } from '@angular/core';
import { ControllerService } from '../../services/controller.service';

interface Graphic {
	id: string;
	name: string;
	position: string;
	samePlates: string;
	colors: string[] | null;
	distress: boolean;
}

interface ModalState {
	isOpen: boolean;
	graphicId: string | null;
	graphicName: string;
	availableColors: string[];
	selectedColors: string[];
	isLoadingColors: boolean;
}

@Component({
	selector: 'app-graphics',
	templateUrl: './graphics.component.html',
	styleUrls: ['./graphics.component.css']
})
export class GraphicsComponent implements OnInit, OnChanges, AfterViewInit, OnDestroy {
	@Input() documentRefreshKey = 0;

	graphics: Graphic[] = [{ id: 'all', name: 'All graphics', position: '', samePlates: '', colors: null, distress: false }];
	graphicNames: string[] = [];
	isLoadingGraphics = false;
	private _teamCode = '';
	modalState: ModalState = { isOpen: false, graphicId: null, graphicName: '', availableColors: [], selectedColors: [], isLoadingColors: false };
	availableColors: string[] = [];
	positionOptions: string[] = ['Choose'];
	isSaving = false;
	hasVersionDocument = false;
	isCheckingDocument = false;
	samePlatesOptions: string[] = [];

	private isMounted = true;
	private teamCodeCheckInterval: any;

	get teamCode(): string {
		return this._teamCode;
	}

	set teamCode(value: string) {
		if (this._teamCode !== value) {
			this._teamCode = value;
			if (value && value !== '') {
				this.loadAvailableColors();
			}
		}
	}

	isRunningInBrowser = false;

	constructor(
		private controller: ControllerService,
		private cdr: ChangeDetectorRef
	) {
		this.isRunningInBrowser = !(window as any).__adobe_cep__ && !(window as any).leap;
	}

	ngOnInit(): void {
		this.checkVersionDocument().then(() => {
			if (this.hasVersionDocument) {
				this.loadGraphicsList();
				this.loadTeamCode();
				this.loadPositionOptions();
			}
		});
	}

	ngOnChanges(changes: SimpleChanges): void {
		if (changes['documentRefreshKey']) {
			setTimeout(() => {
				this.checkVersionDocument().then(() => {
					if (this.hasVersionDocument) {
						this.loadGraphicsList();
						this.loadTeamCode();
						this.loadPositionOptions();
					}
				});
			}, 200);
		}
	}

	checkVersionDocument(): Promise<void> {
		if (!(window as any).__adobe_cep__ && !(window as any).leap) {
			this.hasVersionDocument = false;
			return Promise.resolve();
		}

		if (!(window as any).leap) {
			return this.waitForSession(10, 100).then(() => {
				return this.performVersionDocumentCheck();
			}).catch(() => {
				this.hasVersionDocument = false;
				this.isCheckingDocument = false;
				this.cdr.detectChanges();
				return Promise.resolve();
			});
		}

		return this.performVersionDocumentCheck();
	}

	private performVersionDocumentCheck(): Promise<void> {
		this.isCheckingDocument = true;
		return this.controller.getTemplateInfo()
			.then(result => {
				if (result.success && result.hasDocument) {
					const isVersionFile = result.hasDocument && result.data && result.data.teamCode;
					this.hasVersionDocument = isVersionFile || false;
				} else {
					this.hasVersionDocument = false;
				}
				this.isCheckingDocument = false;
				this.cdr.detectChanges();
			})
			.catch(err => {
				if (err !== 'No leap') {

					this.hasVersionDocument = false;
					this.isCheckingDocument = false;
					this.cdr.detectChanges();
				} else {
					this.isCheckingDocument = false;
					this.cdr.detectChanges();
					setTimeout(() => {
						if ((window as any).leap) {
							this.performVersionDocumentCheck();
						} else {
							this.hasVersionDocument = false;
							this.cdr.detectChanges();
						}
					}, 300);
				}
			});
	}

	private waitForSession(maxRetries: number, delayMs: number): Promise<void> {
		return new Promise((resolve, reject) => {
			let retries = 0;
			const checkSession = () => {
				if ((window as any).leap) {
					resolve();
				} else if (retries < maxRetries) {
					retries++;
					setTimeout(checkSession, delayMs);
				} else {
					reject(new Error('Leap not available after retries'));
				}
			};
			checkSession();
		});
	}

	loadTeamCode(): void {
		this.controller.getTemplateInfo()
			.then(result => {
				if (result.success && result.data && result.data.teamCode) {
					this.teamCode = result.data.teamCode;
				} else {

				}
			})
			.catch(err => {

			});
	}

	loadAvailableColors(): void {
		if (!this.teamCode || this.teamCode === '') {
			return;
		}

		this.controller.getColorCodesFromExcel(this.teamCode)
			.then(result => {
				if (result.success && result.colors && Array.isArray(result.colors)) {
					this.availableColors = result.colors;
				} else {

					this.availableColors = [];
				}
			})
			.catch(err => {

				this.availableColors = [];
			});
	}

	loadPositionOptions(): void {
		this.controller.getGraphicPlacementOptions()
			.then(result => {
				if (result.success && result.placements && Array.isArray(result.placements)) {
					this.positionOptions = result.placements;
					setTimeout(() => {
						this.autoSelectSinglePosition();
					}, 100);
				} else {

					this.positionOptions = ['Choose'];
				}
			})
			.catch(err => {

				this.positionOptions = ['Choose'];
			});
	}

	loadGraphicsDataFromXMP(): void {
		this.controller.loadGraphicsData()
			.then(result => {
				if (result.success && result.graphicsData && Array.isArray(result.graphicsData) && result.graphicsData.length > 0) {
					const graphicsDataMap: { [key: string]: any } = {};
					result.graphicsData.forEach((graphicData: any) => {
						graphicsDataMap[graphicData.name] = graphicData;
					});

					this.graphics = this.graphics.map(g => {
						if (g.id === 'all') {
							return g;
						}
						const savedData = graphicsDataMap[g.name];
						if (savedData) {
							let colorsValue = savedData.colors;
							if (colorsValue === null || colorsValue === undefined) {
								colorsValue = null;
							} else if (Array.isArray(colorsValue)) {
								if (this.availableColors.length > 0 &&
									colorsValue.length === this.availableColors.length &&
									colorsValue.every(color => this.availableColors.includes(color))) {
									colorsValue = null;
								}
							} else {
								colorsValue = [];
							}

							return {
								...g,
								position: savedData.position || '',
								samePlates: savedData.samePlates || '',
								colors: colorsValue,
								distress: savedData.distress !== undefined ? savedData.distress : false
							};
						}
						return g;
					});
					this.saveToLocalStorage();
					this.cdr.detectChanges();
					setTimeout(() => {
						this.autoSelectSinglePosition();
					}, 100);
				}
			})
			.catch(err => {

			});
	}

	loadGraphicsList(): void {
		this.isLoadingGraphics = true;

		this.controller.getGraphicsList()
			.then(result => {
				if (result.success && result.graphics && Array.isArray(result.graphics)) {
					this.graphicNames = result.graphics;
					this.graphics = [
						{ id: 'all', name: 'All graphics', position: '', samePlates: '', colors: null, distress: false },
						...result.graphics.map((name: string, index: number) => ({
							id: `graphic-${index}`,
							name: name,
							position: '',
							samePlates: '',
							colors: null,
							distress: false
						}))
					];
					this.samePlatesOptions = [...this.graphicNames, 'None'];
					this.loadTeamCode();
					setTimeout(() => {
						this.loadGraphicsDataFromXMP();
					}, 100);
				} else {

					this.graphicNames = [];
					this.graphics = [{ id: 'all', name: 'All graphics', position: '', samePlates: '', colors: null, distress: false }];
					this.samePlatesOptions = ['None'];
				}
			})
			.catch(err => {

				this.graphicNames = [];
				this.graphics = [{ id: 'all', name: 'All graphics', position: '', samePlates: '', colors: null, distress: false }];
				this.samePlatesOptions = ['None'];
			})
			.finally(() => {
				this.isLoadingGraphics = false;
				this.cdr.detectChanges();
			});
	}

	ngOnDestroy(): void {
		this.isMounted = false;
		if (this.teamCodeCheckInterval) {
			clearInterval(this.teamCodeCheckInterval);
		}
	}

	ngAfterViewInit(): void {
		setTimeout(() => {
			this.autoSelectSinglePosition();
		}, 300);
	}

	autoSelectSinglePosition(): void {
		if (this.positionOptions.length > 0 && this.graphics.length > 0 && !this.isLoadingGraphics) {
			const validOptions = this.positionOptions.filter(opt => opt !== 'Choose');
			if (validOptions.length === 1) {
				setTimeout(() => {
					const singlePosition = validOptions[0];
					const individualGraphics = this.graphics.filter(g => g.id !== 'all');
					const needsUpdate = individualGraphics.some(g => g.position !== singlePosition);
					if (needsUpdate) {
						this.graphics = this.graphics.map(g => {
							if (g.id === 'all') {
								return g;
							}
							return {
								...g,
								position: singlePosition
							};
						});
						this.saveToLocalStorage();
						this.cdr.detectChanges();
					}
				}, 200);
			}
		}
	}

	handleColorsClick(graphicId: string, graphicName: string): void {
		this.modalState = {
			isOpen: true,
			graphicId,
			graphicName,
			availableColors: [],
			selectedColors: [],
			isLoadingColors: true
		};

		this.controller.getColorCodesFromExcel(this.teamCode)
			.then(result => {
				if (result.success && result.colors && Array.isArray(result.colors)) {
					const graphic = this.graphics.find(g => g.id === graphicId);
					let selectedColors: string[] = [];
					if (graphic?.colors === null) {
						selectedColors = result.colors;
					} else if (graphic?.colors && graphic.colors.length > 0) {
						selectedColors = graphic.colors;
					}

					this.modalState = {
						isOpen: true,
						graphicId,
						graphicName,
						availableColors: result.colors,
						selectedColors,
						isLoadingColors: false
					};
				} else {

					this.modalState = {
						isOpen: true,
						graphicId,
						graphicName,
						availableColors: [],
						selectedColors: [],
						isLoadingColors: false
					};
				}
			})
			.catch(err => {

				this.modalState = {
					isOpen: true,
					graphicId,
					graphicName,
					availableColors: [],
					selectedColors: [],
					isLoadingColors: false
				};
			});
	}

	handleColorsSave(graphicId: string, selectedColors: string[]): void {
		const modalAvailableColors = this.modalState.availableColors || [];
		let colorsToSave: string[] | null;
		if (selectedColors.length === 0) {
			colorsToSave = [];
		} else if (selectedColors.length === modalAvailableColors.length) {
			colorsToSave = null;
		} else {
			colorsToSave = selectedColors;
		}

		if (graphicId === 'all') {
			this.graphics = this.graphics.map(g => ({ ...g, colors: colorsToSave }));
		} else {
			this.graphics = this.graphics.map(g =>
				g.id === graphicId ? { ...g, colors: colorsToSave } : g
			);
		}

		this.modalState = { isOpen: false, graphicId: null, graphicName: '', availableColors: [], selectedColors: [], isLoadingColors: false };
		this.saveToLocalStorage();
	}

	getColorsDisplayData(graphic: Graphic): { isAll: boolean; count: number | null; colorsText: string | null } {
		if (graphic.colors === null) {
			return { isAll: true, count: null, colorsText: null };
		}
		if (!graphic.colors || graphic.colors.length === 0) {
			return { isAll: false, count: 0, colorsText: null };
		}
		const selectedCount = graphic.colors.length;
		const colorsText = graphic.colors.join(', ');
		return { isAll: false, count: selectedCount, colorsText };
	}

	handlePositionChange(graphicId: string, position: string): void {
		const actualPosition = position === 'Choose' ? '' : position;

		if (graphicId === 'all') {
			this.graphics = this.graphics.map(g => ({ ...g, position: actualPosition }));
		} else {
			this.graphics = this.graphics.map(g =>
				g.id === graphicId ? { ...g, position: actualPosition } : g
			);
		}
		this.saveToLocalStorage();
		this.cdr.detectChanges();
	}

	handleSamePlatesChange(graphicId: string, samePlates: string): void {
		this.graphics = this.graphics.map(g =>
			g.id === graphicId ? { ...g, samePlates } : g
		);
		this.saveToLocalStorage();
	}

	getAllGraphicsDistressState(): { checked: boolean; indeterminate: boolean } {
		const allGraphicsRow = this.graphics.find(g => g.id === 'all');
		if (!allGraphicsRow) return { checked: false, indeterminate: false };

		const individualGraphics = this.graphics.filter(g => g.id !== 'all');
		if (individualGraphics.length === 0) {
			return { checked: allGraphicsRow.distress, indeterminate: false };
		}

		const checkedCount = individualGraphics.filter(g => g.distress).length;
		const uncheckedCount = individualGraphics.filter(g => !g.distress).length;

		if (checkedCount === individualGraphics.length) {
			return { checked: true, indeterminate: false };
		}
		if (uncheckedCount === individualGraphics.length) {
			return { checked: false, indeterminate: false };
		}
		return { checked: false, indeterminate: true };
	}

	handleDistressChange(graphicId: string): void {
		if (graphicId === 'all') {
			const currentState = this.getAllGraphicsDistressState();
			const newDistressValue = !currentState.checked || currentState.indeterminate;
			this.graphics = this.graphics.map(g => ({ ...g, distress: newDistressValue }));
		} else {
			this.graphics = this.graphics.map(g =>
				g.id === graphicId ? { ...g, distress: !g.distress } : g
			);
		}
		this.saveToLocalStorage();
	}

	handleDoneClick(): void {
		const graphicsToSave = this.graphics
			.filter(g => g.id !== 'all')
			.map(g => {
				let colorsArray = g.colors;
				if (colorsArray === null) {
					colorsArray = this.availableColors.length > 0 ? [...this.availableColors] : [];
				} else if (!Array.isArray(colorsArray)) {
					colorsArray = [];
				}

				return {
					name: g.name,
					position: g.position || '',
					samePlates: g.samePlates || '',
					colors: colorsArray,
					distress: g.distress
				};
			});

		this.isSaving = true;
		this.controller.saveGraphicsData(graphicsToSave)
			.then(result => {
				if (result.success) {

				} else {

				}
			})
			.catch(err => {

			})
			.finally(() => {
				this.isSaving = false;
				this.cdr.detectChanges();
			});
	}

	saveToLocalStorage(): void {
		if (this.graphics.length > 0) {
			const graphicsData = this.graphics.filter(g => g.id !== 'all');
			try {
				localStorage.setItem('graphicsPositions', JSON.stringify(graphicsData));
				window.dispatchEvent(new CustomEvent('graphicsPositionsUpdated'));
			} catch (err) {

			}
		}
	}

	get isSingleGraphic(): boolean {
		return this.graphicNames.length === 1;
	}

	get isSinglePosition(): boolean {
		const validPositionOptions = this.positionOptions.filter(opt => opt !== 'Choose');
		return validPositionOptions.length === 1;
	}
}
