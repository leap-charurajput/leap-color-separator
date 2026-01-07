import { Injectable } from '@angular/core';

@Injectable({
providedIn: 'root'
})
export class ControllerService {

constructor() {
this.init();
}

	private init(): void {
		this.log('client controller is initing...');
		this.log(`do we have leap ? ${this.hasSession()}`);

		const isInCEP = !!(window as any).__adobe_cep__;
		this.log(`are we in CEP environment ? ${isInCEP}`);

		if (!this.hasSession()) {
			this.waitForSession().then(() => {
				this.log('Leap is now available');
			}).catch(() => {
				if (isInCEP) {



				}
			});
		}

		this.log('client controller has inited');
	}

	private waitForSession(maxRetries: number = 50, delayMs: number = 100): Promise<void> {
		return new Promise((resolve, reject) => {
			let retries = 0;
			const checkSession = () => {
				if (this.hasSession()) {
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

	invokePlugin(options: any): Promise<any> {
		this.log('invokePlugin');

		return this.ensureSession().then(() => {
			return (window as any).leap.invokePlugin(options)
				.then((res: any) => {

					return res;
				})
				.catch((err: any) => {

					throw err;
				});
		});
	}

	getGraphicsList(): Promise<any> {
		this.log('getGraphicsList called');

		return this.ensureSession().then(() => {
			return (window as any).leap.scriptLoader().evalScript('handleGetGraphicsList', {})
				.then((res: string) => {
					const result = JSON.parse(res);

					return result;
				})
				.catch((err: any) => {

					throw err;
				});
		});
	}

toggleLayerVisibility(layerName: string): Promise<any> {
	this.log('toggleLayerVisibility called for layer: ' + layerName);

	return this.ensureSession().then(() => {
		const params = { layerName: layerName };
		return (window as any).leap.scriptLoader().evalScript('handleToggleLayerVisibility', params)
			.then((res: string) => {
				const result = JSON.parse(res);

				return result;
			})
			.catch((err: any) => {

				throw err;
			});
	});
}

updateSepTable(separationData: any[]): Promise<any> {
	this.log('updateSepTable called with ' + separationData.length + ' rows');

	return this.ensureSession().then(() => {
		const params = { separationData: separationData };
		return (window as any).leap.scriptLoader().evalScript('handleUpdateSepTable', params)
			.then((res: string) => {
				const result = JSON.parse(res);

				return result;
			})
			.catch((err: any) => {

				throw err;
			});
	});
}

	getTemplateInfo(): Promise<any> {
		this.log('getTemplateInfo called');

		return this.ensureSession().then(() => {
			return (window as any).leap.scriptLoader().evalScript('handleGetTemplateInfo', {})
				.then((res: string) => {
					const result = JSON.parse(res);

					return result;
				})
				.catch((err: any) => {

					throw err;
				});
		});
	}

getGraphicSwatches(graphicName: string): Promise<any> {
	this.log('getGraphicSwatches called for: ' + graphicName);

	return this.ensureSession().then(() => {
		const params = { graphicName: graphicName };
		return (window as any).leap.scriptLoader().evalScript('handleGetGraphicSwatches', params)
			.then((res: string) => {
				const result = JSON.parse(res);

				return result;
			})
			.catch((err: any) => {

				throw err;
			});
	});
}

	checkSeparatedDocument(): Promise<any> {
		this.log('checkSeparatedDocument called');

		return this.ensureSession().then(() => {
			return (window as any).leap.scriptLoader().evalScript('handleCheckSeparatedDocument', {})
				.then((res: string) => {
					const result = JSON.parse(res);

					return result;
				})
				.catch((err: any) => {

					throw err;
				});
		});
	}

	getSeparationProfiles(): Promise<any> {
		this.log('getSeparationProfiles called');

		return this.ensureSession().then(() => {
			return (window as any).leap.scriptLoader().evalScript('handleGetSeparationProfiles', {})
				.then((res: string) => {
					const result = JSON.parse(res);

					return result;
				})
				.catch((err: any) => {

					throw err;
				});
		});
	}

saveSeparationProfiles(profiles: any[]): Promise<any> {
	this.log('saveSeparationProfiles called with ' + profiles.length + ' profiles');

	return this.ensureSession().then(() => {
		const params = { profiles: profiles };
		return (window as any).leap.scriptLoader().evalScript('handleSaveSeparationProfiles', params)
			.then((res: string) => {
				const result = JSON.parse(res);

				return result;
			})
			.catch((err: any) => {

				throw err;
			});
	});
}

getColorCodesFromExcel(teamCode: string): Promise<any> {
	this.log('getColorCodesFromExcel called for team: ' + teamCode);

	return this.ensureSession().then(() => {
		return (window as any).leap.getColorCodesFromExcel(teamCode)
			.then((result: any) => {

				return result;
			})
			.catch((err: any) => {

				throw err;
			});
	});
}

getStyleCodesFromExcel(teamCode: string): Promise<any> {
	this.log('getStyleCodesFromExcel called for team: ' + teamCode);

	return this.ensureSession().then(() => {
		return (window as any).leap.getStyleCodesFromExcel(teamCode)
			.then((result: any) => {

				return result;
			})
			.catch((err: any) => {

				throw err;
			});
	});
}

getProfileNamesFromExcel(styleCodes: string[]): Promise<any> {
	this.log('getProfileNamesFromExcel called with ' + styleCodes.length + ' style codes');

	return this.ensureSession().then(() => {
		return (window as any).leap.getProfileNamesFromExcel(styleCodes)
			.then((result: any) => {

				return result;
			})
			.catch((err: any) => {

				throw err;
			});
	});
}

getGraphicPlacementOptions(): Promise<any> {
	this.log('getGraphicPlacementOptions called');

	return this.ensureSession().then(() => {
		return (window as any).leap.getGraphicPlacementOptions()
			.then((result: any) => {

				return result;
			})
			.catch((err: any) => {

				throw err;
			});
	});
}

saveGraphicsData(graphicsData: any[]): Promise<any> {
	this.log('saveGraphicsData called with ' + graphicsData.length + ' graphics');

	return this.ensureSession().then(() => {
		const params = { graphicsData: graphicsData };
		return (window as any).leap.scriptLoader().evalScript('handleSaveGraphicsData', params)
			.then((res: string) => {
				const result = JSON.parse(res);

				return result;
			})
			.catch((err: any) => {

				throw err;
			});
	});
}

loadGraphicsData(): Promise<any> {
	this.log('loadGraphicsData called');

	return this.ensureSession().then(() => {
		return (window as any).leap.scriptLoader().evalScript('handleLoadGraphicsData', {})
			.then((res: string) => {
				const result = JSON.parse(res);

				return result;
			})
			.catch((err: any) => {

				throw err;
			});
	});
}

loadSeparationPaths(): Promise<any> {
	this.log('loadSeparationPaths called');

	return this.ensureSession().then(() => {
		return (window as any).leap.scriptLoader().evalScript('handleLoadSeparationPaths', {})
			.then((res: string) => {
				const result = JSON.parse(res);

				return result;
			})
			.catch((err: any) => {

				throw err;
			});
	});
}

checkGraphicFolderExists(graphicName: string): Promise<any> {
	this.log('checkGraphicFolderExists called for: ' + graphicName);

	return this.ensureSession().then(() => {
		const params = { graphicName: graphicName };
		return (window as any).leap.scriptLoader().evalScript('handleCheckGraphicFolderExists', params)
			.then((res: string) => {
				const result = JSON.parse(res);

				return result;
			})
			.catch((err: any) => {

				throw err;
			});
	});
}

getProfileCodeFromName(profileName: string): Promise<any> {
	this.log('getProfileCodeFromName called for: ' + profileName);

	return this.ensureSession().then(() => {
		const params = { profileName: profileName };
		return (window as any).leap.scriptLoader().evalScript('handleGetProfileCodeFromName', params)
			.then((res: string) => {
				const result = JSON.parse(res);

				return result;
			})
			.catch((err: any) => {

				throw err;
			});
	});
}

switchToVersionDocument(): Promise<any> {
	this.log('switchToVersionDocument called');

	return this.ensureSession().then(() => {
		return (window as any).leap.scriptLoader().evalScript('handleSwitchToVersionDocument', {})
			.then((res: string) => {
				const result = JSON.parse(res);

				return result;
			})
			.catch((err: any) => {

				throw err;
			});
	});
}

openSeparationDocument(filePath: string): Promise<any> {
	this.log('openSeparationDocument called for: ' + filePath);

	return this.ensureSession().then(() => {
		const params = { filePath: filePath };
		return (window as any).leap.scriptLoader().evalScript('handleOpenSeparationDocument', params)
			.then((res: string) => {
				const result = JSON.parse(res);

				return result;
			})
			.catch((err: any) => {

				throw err;
			});
	});
}

exportPrintGuidePDF(): Promise<any> {
	this.log('exportPrintGuidePDF called');

	return this.ensureSession().then(() => {
		return (window as any).leap.scriptLoader().evalScript('handleExportPrintGuidePDF', {})
			.then((res: string) => {
				const result = JSON.parse(res);

				return result;
			})
			.catch((err: any) => {

				throw err;
			});
	});
}

exportPostscript(): Promise<any> {
	this.log('exportPostscript called');

	return this.ensureSession().then(() => {
		return (window as any).leap.scriptLoader().evalScript('handleExportPostscript', {})
			.then((res: string) => {
				const result = JSON.parse(res);

				return result;
			})
			.catch((err: any) => {

				throw err;
			});
	});
}

exportSeparationsPreviewPDF(): Promise<any> {
	this.log('exportSeparationsPreviewPDF called');

	return this.ensureSession().then(() => {
		return (window as any).leap.scriptLoader().evalScript('handleExportSeparationsPreviewPDF', {})
			.then((res: string) => {
				const result = JSON.parse(res);

				return result;
			})
			.catch((err: any) => {

				throw err;
			});
	});
}

getInkInformationBatch(inkNames: string[], profileName?: string): Promise<any> {
	this.log('getInkInformationBatch called with ' + inkNames.length + ' ink names');

	return this.ensureSession().then(() => {
		return (window as any).leap.getInkInformationBatch(inkNames, profileName)
			.then((result: any) => {

				return result;
			})
			.catch((err: any) => {

				throw err;
			});
	});
}

getProfileInformation(profileCode: string): Promise<any> {
	this.log('getProfileInformation called for: ' + profileCode);

	return this.ensureSession().then(() => {
		return (window as any).leap.getProfileInformation(profileCode)
			.then((result: any) => {

				return result;
			})
			.catch((err: any) => {

				throw err;
			});
	});
}

	getBodyColor(): Promise<any> {
		this.log('getBodyColor called');

		return this.ensureSession().then(() => {
			return (window as any).leap.scriptLoader().evalScript('handleGetBodyColor', {})
				.then((res: string) => {
					const result = JSON.parse(res);

					return result;
				})
				.catch((err: any) => {

					throw err;
				});
		});
	}

performSeparation(graphicName: string, styleCodes: string[] = [], profileMetadata: any = null): Promise<any> {
	this.log('performSeparation called for: ' + graphicName);

	return this.ensureSession().then(() => {
		const params = {
			graphicName: graphicName,
			styleCodes: styleCodes,
			profileMetadata: profileMetadata
		};

		return (window as any).leap.scriptLoader().evalScript('handlePerformSeparation', params)
			.then((res: string) => {
				const result = JSON.parse(res);

				return result;
			})
			.catch((err: any) => {

				throw err;
			});
	});
}


	hasSession(): boolean {
		return (window as any).leap !== undefined;
	}

	private ensureSession(maxRetries: number = 50, delayMs: number = 100): Promise<void> {
		if (this.hasSession()) {
			return Promise.resolve();
		}

		return this.waitForSession(maxRetries, delayMs).catch(() => {
			return Promise.reject('No leap');
		});
	}

private log(val: string): void {

}

private get name(): string {
	return 'Client Controller:: ';
}
}
