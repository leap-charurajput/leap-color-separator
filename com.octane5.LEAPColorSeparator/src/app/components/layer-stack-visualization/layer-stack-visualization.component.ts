import { Component, Input, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { ControllerService } from '../../services/controller.service';
import { Subject, takeUntil } from 'rxjs';

interface GarmentOption {
	id: string;
	label: string;
	svg: string;
}

interface ColorRow {
	id: number;
	colorName: string;
	layerColor?: string;
	colorIcon?: any;
	flashEnabled: boolean;
	coolEnabled: boolean;
	wbEnabled: boolean;
	removed: boolean;
}

@Component({
	selector: 'app-layer-stack-visualization',
	templateUrl: './layer-stack-visualization.component.html',
	styleUrls: ['./layer-stack-visualization.component.css']
})
export class LayerStackVisualizationComponent implements OnInit, OnDestroy {
	@Input() colorRows: ColorRow[] = [];
	@Input() garmentColor = '#4A5568';
	@Input() garmentName = 'Garment: Athletic Navy';

	garmentOptions: GarmentOption[] = [
		{ id: 'base', label: 'Base', svg: 'assets/images/base.svg' },
		{ id: 'duffle', label: 'Duffle', svg: 'assets/images/Duffle.svg' },
		{ id: 'hoodie', label: 'Hoodie', svg: 'assets/images/Hoodie.svg' },
		{ id: 'jacket', label: 'Jacket', svg: 'assets/images/Jacket.svg' },
		{ id: 'jersey', label: 'Jersey', svg: 'assets/images/Jersey.svg' },
		{ id: 'ls-tee', label: 'LS Tee', svg: 'assets/images/LS Tee.svg' },
		{ id: 'ls-zip', label: 'LS Zip', svg: 'assets/images/LS Zip.svg' },
		{ id: 'poh', label: 'POH', svg: 'assets/images/POH.svg' },
		{ id: 'pants', label: 'Pants', svg: 'assets/images/Pants.svg' },
		{ id: 'polo', label: 'Polo', svg: 'assets/images/Polo.svg' },
		{ id: 'ss-tee', label: 'SS Tee', svg: 'assets/images/SS Tee.svg' },
		{ id: 'ss-vneck', label: 'SS V Neck', svg: 'assets/images/SS V Neck.svg' },
		{ id: 'shorts', label: 'Shorts', svg: 'assets/images/Shorts.svg' },
		{ id: 'tank', label: 'Tank', svg: 'assets/images/Tank.svg' },
		{ id: 'other', label: 'Other', svg: 'assets/images/Other.svg' }
	];

	selectedGarmentId = 'base';
	bodyColor = '#ec008c';
	bodyColorName = '';
	coloredSvgs: { [key: string]: string } = {};
	colorizedForColor: string | null = null;

	private destroy$ = new Subject<void>();

	private readonly LAYER_SPACING = 14;
	private readonly LAYER_BASE_OFFSET = 28;
	private readonly BASE_HEIGHT = 80;
	private readonly TOP_PADDING = 30;
	private readonly SVG_VIEWBOX_WIDTH = 59.99;
	private readonly SVG_VIEWBOX_HEIGHT = 14.72;
	private readonly LAYER_RENDERED_WIDTH = 110;
	private readonly LINE_OFFSET_ABOVE_TOP = 15;

	constructor(
		private controller: ControllerService,
		private cdr: ChangeDetectorRef
	) {
	}

	ngOnInit(): void {
		this.fetchBodyColor();
	}

	ngOnDestroy(): void {
		this.destroy$.next();
		this.destroy$.complete();
	}

	get selectedGarment(): GarmentOption {
		return this.garmentOptions.find(g => g.id === this.selectedGarmentId) || this.garmentOptions[0];
	}

	get activeColors(): ColorRow[] {
		return this.colorRows.filter(row => !row.removed);
	}

	get layerHeight(): number {
		return (this.SVG_VIEWBOX_HEIGHT / this.SVG_VIEWBOX_WIDTH) * this.LAYER_RENDERED_WIDTH;
	}

	get containerHeight(): number {
		const layerCount = this.activeColors.length;
		if (layerCount === 0) return this.BASE_HEIGHT;

		const requiredHeight = this.BASE_HEIGHT + (layerCount * this.layerSpacing) + this.layerBaseOffset + this.TOP_PADDING;
		return Math.max(requiredHeight, 200);
	}

	get linePositions(): { top: number; height: number } {
		if (this.activeColors.length === 0) {
			return { top: 0, height: 0 };
		}

		const topLayerIndex = this.activeColors.length - 1;
		const topLayerBottom = this.layerBaseOffset + topLayerIndex * this.layerSpacing;
		const topLayerTop = topLayerBottom + this.layerHeight;

		const topLayerTopFromTop = this.containerHeight - topLayerTop;
		const lineStartTop = topLayerTopFromTop - this.LINE_OFFSET_ABOVE_TOP;

		const firstLayerBottom = this.layerBaseOffset;
		const lineEndBottom = this.containerHeight - firstLayerBottom;

		const lineHeight = lineEndBottom - lineStartTop;

		return {
			top: lineStartTop,
			height: lineHeight
		};
	}

	fetchBodyColor(): void {
		this.controller.getBodyColor()
			.then((result: any) => {
				if (result.success && result.bodyColor) {
					this.bodyColor = result.bodyColor;
					if (result.colorName) {
						this.bodyColorName = result.colorName;
					}
					this.colorizeSvgs();
				} else {

				}
			})
			.catch((err: any) => {

			});
	}

	async colorizeSvgs(): Promise<void> {
		if (!this.bodyColor || this.colorizedForColor === this.bodyColor) {
			return;
		}

		const svgPromises = this.garmentOptions.map(async (option) => {
			try {
				const response = await fetch(option.svg);
				const svgText = await response.text();

				const coloredSvg = svgText
					.replace(/fill:\s*#[0-9a-fA-F]{6}(\s*;?)/gi, `fill: ${this.bodyColor}$1`)
					.replace(/fill="#[0-9a-fA-F]{6}"/gi, `fill="${this.bodyColor}"`)
					.replace(/fill='#[0-9a-fA-F]{6}'/gi, `fill='${this.bodyColor}'`);

				const encodedSvg = encodeURIComponent(coloredSvg);
				const dataUri = `data:image/svg+xml;charset=utf-8,${encodedSvg}`;

				return { id: option.id, dataUri };
			} catch (error) {

				return { id: option.id, dataUri: option.svg };
			}
		});

		const results = await Promise.all(svgPromises);

		const newColoredSvgs: { [key: string]: string } = {};
		results.forEach(result => {
			newColoredSvgs[result.id] = result.dataUri;
		});

		this.coloredSvgs = newColoredSvgs;
		this.colorizedForColor = this.bodyColor;
		this.cdr.detectChanges();
	}

	getLayerColor(row: ColorRow, index: number): string {
		if (row.layerColor) {
			return row.layerColor;
		}

		const defaultColors = ['#E8D5C4', '#FFFFFF', '#2D3748', '#E53E3E', '#DD6B20', '#38B2AC', '#3182CE'];
		return defaultColors[index % defaultColors.length];
	}

	get layerBaseOffset(): number {
		return this.LAYER_BASE_OFFSET;
	}

	get layerSpacing(): number {
		return this.LAYER_SPACING;
	}

	onGarmentSelect(garmentId: string): void {
		this.selectedGarmentId = garmentId;
	}

	getGarmentImageSrc(garmentId: string): string {
		return this.coloredSvgs[garmentId] || this.garmentOptions.find(g => g.id === garmentId)?.svg || '';
	}
}
