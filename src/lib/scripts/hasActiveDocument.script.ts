import { evalScript } from '../../libs/helper';
import { polyfillsCode } from './polyfills';

export async function hasActiveDocument(): Promise<boolean> {
	const script =
		polyfillsCode +
		`
(function() {
	try {
		return JSON.stringify({ success: true, hasDocument: app.documents.length > 0 });
	} catch (e) {
		return JSON.stringify({ success: false, hasDocument: false });
	}
})();
`;

	try {
		const result = await evalScript(script);
		if (!result || String(result).trim() === '') return false;
		const parsed = JSON.parse(String(result));
		return !!(parsed.success && parsed.hasDocument);
	} catch {
		return false;
	}
}
