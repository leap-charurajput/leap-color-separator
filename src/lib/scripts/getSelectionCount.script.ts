import { evalScript } from '../../libs/helper';
import { polyfillsCode } from './polyfills';

export async function getSelectionCount(): Promise<number> {
	const script =
		polyfillsCode +
		`
(function() {
	try {
		var count = 0;
		if (app.documents.length > 0) {
			count = app.selection ? app.selection.length : 0;
		}
		return JSON.stringify({ success: true, count: count });
	} catch (e) {
		return JSON.stringify({ success: false, error: e.message || e.toString(), count: 0 });
	}
})();
`;

	try {
		const result = await evalScript(script);
		if (!result || String(result).trim() === '') return 0;
		const parsed = JSON.parse(String(result));
		return parsed.success ? Number(parsed.count) || 0 : 0;
	} catch {
		return 0;
	}
}
