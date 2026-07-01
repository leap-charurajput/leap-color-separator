import { evalScript } from '../../libs/helper';
import { createGraphicFromSelectionHostCode } from './createGraphicFromSelection.inline';
import { polyfillsCode } from './polyfills';

export interface CreateGraphicFromSelectionInput {
	position: string;
	graphicKey?: string;
	name: string;
	width: number;
	height: number;
}

export async function createGraphicFromSelection(
	payload: CreateGraphicFromSelectionInput
): Promise<any> {
	const paramsJson = JSON.stringify(payload);
	const script =
		polyfillsCode +
		createGraphicFromSelectionHostCode +
		`
(function() {
	try {
		var params = ${paramsJson};
		return createGraphicFromSelectionRun(params);
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
			error: error?.message || 'Unknown error creating graphic'
		};
	}
}
