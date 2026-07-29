import { evalScript } from '../../libs/helper';
import { exportSelectionToAssetsHostCode } from './exportSelectionToAssets.inline';
import { polyfillsCode } from './polyfills';

export interface ExportSelectionToAssetsInput {
	teamCode?: string;
	styleCode?: string;
	position?: string;
}

/*
 * Export the current selection to <activeDocFolder>/ASSETS/<name>.ai and leave that document open.
 * Returns { success, assetsPath, filePath, fileName } or { success:false, error }.
 */
export async function exportSelectionToAssets(payload: ExportSelectionToAssetsInput): Promise<any> {
	const paramsJson = JSON.stringify(payload || {});
	const script =
		polyfillsCode +
		exportSelectionToAssetsHostCode +
		`
(function() {
	try {
		var params = ${paramsJson};
		return exportSelectionToAssetsRun(params);
	} catch (e) {
		return JSON.stringify({ success: false, error: e.message || e.toString() });
	}
})();
`;

	try {
		const result = await evalScript(script);
		if (!result || String(result).trim() === '') {
			return { success: false, error: 'Empty result from ExtendScript' };
		}
		if (
			String(result).indexOf('Error') === 0 ||
			String(result).indexOf('EvalScript error') !== -1
		) {
			return { success: false, error: String(result) };
		}
		return JSON.parse(String(result));
	} catch (error: any) {
		return {
			success: false,
			error: error?.message || 'Unknown error exporting selection'
		};
	}
}
