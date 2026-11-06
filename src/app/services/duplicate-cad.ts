/*
 * Duplicate for a standalone / NN Pro row: the CAD (garment silhouette) PNG for the NEW style, found near
 * the job's artwork document — the same folders the standalone form searches at Prepare:
 *   <doc folder>/Assets (NN Pro product exports, e.g. FM14-1314-H44-71G.png / _R.png),
 *   PNG folders at the doc folder and up to two levels above (e.g. N199-10A-ANG-D31.png).
 * A candidate's name must START with the new style. Ties go to the right side (_R for a back position),
 * then to the job's color code, then to the job's own Item ID with the style swapped.
 * Returns { path, why } — path '' when nothing matches, why says where it looked.
 */
export function findDuplicateCadPng(sourceDocPath: string, job: any, newStyle: string): { path: string; why: string } {
	const style = String(newStyle || '').trim().toUpperCase();
	const req = (window as any).cep_node?.require;
	if (!req || !style || !String(sourceDocPath || '').trim()) {
		return { path: '', why: 'No artwork document to search from.' };
	}
	const fs = req('fs');
	const path = req('path');

	const docDir = path.dirname(String(sourceDocPath));
	const dirs: string[] = [path.join(docDir, 'Assets')];
	let dir = docDir;
	for (let level = 0; level < 3; level++) {
		dirs.push(path.join(dir, 'PNG'));
		const parent = path.dirname(dir);
		if (!parent || parent === dir) break;
		dir = parent;
	}

	const position = String(job?.position || '').trim();
	const wantRear = /\bback\b/i.test(position) || /^BK\d*$/i.test(position);
	const colorCode = String(job?.garmentColorCode || '').split(/[,/]+/)[0].trim().toUpperCase();
	const oldStyle = String(job?.styleCode || '').trim().toUpperCase();
	const itemId = String(job?.itemId || '').trim().toUpperCase();
	const newItem = oldStyle && itemId.indexOf(oldStyle) === 0 ? style + itemId.slice(oldStyle.length) : '';

	const rank = (name: string): number => {
		const base = name.replace(/\.png$/i, '').toUpperCase();
		const isRear = /_R$/.test(base);
		return (
			(isRear === wantRear ? 0 : 1) +
			(colorCode && base.indexOf(colorCode) !== -1 ? 0 : 0.5) +
			(newItem && base.replace(/_R$/, '') === newItem ? 0 : 0.25)
		);
	};

	let best = '';
	let bestRank = Infinity;
	for (const d of dirs) {
		try {
			if (!fs.existsSync(d)) continue;
			for (const f of fs.readdirSync(d) as string[]) {
				const name = String(f);
				if (!/\.png$/i.test(name) || name.toUpperCase().indexOf(style) !== 0) continue;
				const r = rank(name);
				if (r < bestRank) {
					best = path.join(d, name);
					bestRank = r;
				}
			}
		} catch (e) {
			/* unreadable folder — keep looking */
		}
	}
	if (best) return { path: best, why: '' };
	return {
		path: '',
		why: 'Looked for a ' + (wantRear ? 'rear ("_R") ' : '') + 'CAD image starting with ' + style +
			' in the Assets and PNG folders next to the artwork - none found.'
	};
}
