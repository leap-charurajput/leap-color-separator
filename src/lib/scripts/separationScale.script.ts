import { evalScript } from '../../libs/helper';
import { maskSafeTransformHostCode } from './maskSafeTransform.inline';
import { separationScaleHostCode } from './separationScale.inline';
import { polyfillsCode } from './polyfills';

/*
 * Panel-side wrappers for the graphic-scale host helpers. Same pattern as
 * exportSelectionToAssets.script.ts: polyfills + the inline host code + one call, parsed defensively.
 */

export interface SeparationEntrySettings {
	graphicName: string;
	profileName: string;
	/** Separate same-profile group id; '' for the primary group. */
	groupId: string;
	/** Percent of the original size (100 = unchanged); null when no scale is saved. */
	graphicScalePercent: number | null;
	separatedDocumentPath: string;
}

async function runHostCall(fnName: string, params: any): Promise<any> {
	const paramsJson = JSON.stringify(params || {});
	const script =
		polyfillsCode +
		maskSafeTransformHostCode +
		separationScaleHostCode +
		`
(function() {
	try {
		return ${fnName}(${paramsJson});
	} catch (e) {
		return JSON.stringify({ success: false, error: e.message || e.toString() });
	}
})();
`;
	try {
		const result = await evalScript(script);
		const text = String(result == null ? '' : result).trim();
		if (text === '') {
			return { success: false, error: 'Empty result from ExtendScript' };
		}
		if (text.indexOf('EvalScript error') !== -1) {
			return { success: false, error: text };
		}
		try {
			return JSON.parse(text);
		} catch (parseErr) {
			return { success: false, error: 'Unparseable host result: ' + text.slice(0, 200) };
		}
	} catch (err: any) {
		return { success: false, error: err?.message || String(err) };
	}
}

/** Saved settings for every separation group on the active (version) document. */
export async function readSeparationEntries(): Promise<SeparationEntrySettings[]> {
	const res = await runHostCall('ssReadSeparationEntries', {});
	return res?.success && Array.isArray(res.entries) ? res.entries : [];
}

/** Scale the art Prepare placed in the active prepared SEP document. */
export function scalePreparedGraphic(
	graphicName: string,
	percent: number
): Promise<{ success: boolean; skipped?: boolean; percent?: number; before?: number[]; after?: number[]; error?: string }> {
	return runHostCall('ssScalePreparedGraphic', { graphicName, percent });
}
