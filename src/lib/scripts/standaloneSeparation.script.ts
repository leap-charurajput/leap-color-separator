import { evalScript } from '../../libs/helper';
import { standaloneSeparationHostCode } from './standaloneSeparation.inline';
import { polyfillsCode } from './polyfills';

export interface StandaloneSeparationRunInput {
	graphicName: string;
	styleCodes: string[];
	profileMetadata: any;
	jsonData: any;
	sepsTemplateFileName?: string;
	/* ASSETS-export path. Empty/omitted when fromSelection is true (the "Done" flow). */
	exportedFilePath?: string;
	/* "Done" flow: take the art from the CURRENT SELECTION in the source document (no ASSETS export).
	   The SEP doc then lands in a SEPS folder next to the source document. */
	fromSelection?: boolean;
	/* Base file name for the SEP doc on the fromSelection path (e.g. "7G_FM01_Front"). */
	docBaseName?: string;
	/* CAD reference PNG resolved panel-side (PNG folder near the source doc); placed on the SEP doc. */
	cadPngPath?: string;
	/* Two-stage flow: "prepare" | "generate". Omitted = legacy single-shot (no longer used by the panel). */
	stage?: 'prepare' | 'generate' | 'full';
}

/*
 * Run the standalone separation. Reuses the loaded separation engine (splitColors, generateUnderbase,
 * copyAndPrepareSEPDocument, etc.) via global calls; writes the separated file to a flat SEPS
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
