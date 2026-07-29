import { evalScript } from '../../libs/helper';
import { getLicensingInfoHostCode } from './getLicensingInfoFromDocument.inline';
import { polyfillsCode } from './polyfills';

/*
 * Runs the LICENSING-sheet reader in the active document and returns:
 *   { success, artboardFound, frameCount, raw: { orgCode, teamName, conceptCode, style, color,
 *     placement, designName, artist, date, player, productLine, graphicCode, season, artRevisions } }
 * The panel maps `raw` onto the Standalone form fields.
 */
export async function getLicensingInfoFromDocument(): Promise<any> {
	const script =
		polyfillsCode +
		getLicensingInfoHostCode +
		`
(function() {
	try {
		return getLicensingInfoRun({});
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
			error: error?.message || 'Unknown error reading licensing info'
		};
	}
}
