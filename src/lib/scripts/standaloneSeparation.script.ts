import { evalScript } from '../../libs/helper';
import { standaloneSeparationHostCode } from './standaloneSeparation.inline';
import { polyfillsCode } from './polyfills';

export interface StandaloneSeparationRunInput {
	graphicName: string;
	styleCodes: string[];
	profileMetadata: any;
	jsonData: any;
	sepsTemplateFileName?: string;
	exportedFilePath: string;
}

/*
 * Run the standalone separation. Reuses the loaded separation engine (splitColors, generateUnderbase,
 * copyAndPrepareSEPDocument, etc.) via global calls; writes the separated file to a flat SEPARATIONS
 * folder next to ASSETS and leaves it open. Returns { success, separatedDocumentPath, layerNames, ... }.
 */
export async function runStandaloneSeparation(payload: StandaloneSeparationRunInput): Promise<any> {
	const paramsJson = JSON.stringify(payload || {});
	const script =
		polyfillsCode +
		standaloneSeparationHostCode +
		`
(function() {
	try {
		var params = ${paramsJson};
		return standaloneSeparationRun(params);
	} catch (e) {
		try { unloadLEAPColorSepsActions(); } catch (ue) { }
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
			error: error?.message || 'Unknown error running standalone separation'
		};
	}
}
