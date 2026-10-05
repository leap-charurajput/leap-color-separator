/*
 * Inline (panel-deployed) copy of the JSX helper lcsTransformKeepingMasks in src/jsx/utilities.jsx:
 * move and/or scale an item WITHOUT detaching its opacity masks. Scripted translate()/resize() never
 * transform opacity masks; a symbol instance is one object, so transforming it carries the masks, and
 * breaking the link bakes the transform in (verified in Illustrator on a real graphic, 2026-10-02).
 *
 * Kept as a SEPARATE function name so the inline copy can never override the JSX one (or the reverse)
 * when both are loaded in the same ExtendScript engine. Keep the two bodies identical.
 */
export const maskSafeTransformHostCode = `
/*
 * Move and/or scale an item WITHOUT detaching its opacity masks (2026-10-02).
 *
 * Scripted translate()/resize() transform the artwork but never its opacity masks — verified in
 * Illustrator on a real graphic: the mask's bounding box did not change by a single point while the art
 * moved and scaled. Prepare pastes the art at the view centre and then translate()s it to SEP_ART, so a
 * graphic with a distress/transparency mask came out with the mask left behind off the artboard and the
 * art rendered solid. A SYMBOL INSTANCE is a single object, so transforming it carries
 * everything inside — masks included — and breaking the link bakes that transform into the art.
 * Returns the resulting item (the original is replaced, keeping its name and stacking position). On any
 * failure it falls back to plain translate/resize on the original, so the caller never ends up worse
 * off than before.
 */
function lcsMaskSafeTransform(doc, item, dx, dy, scalePct, scaleAbout) {
	dx = Number(dx) || 0;
	dy = Number(dy) || 0;
	var doScale = scalePct != null && Number(scalePct) > 0 && Number(scalePct) !== 100;
	if (!item || (!dx && !dy && !doScale)) return item;
	var layer = item.layer;
	var name = item.name;
	var symName = "__LEAP_MASKSAFE_" + (new Date()).getTime();
	var sym = null, inst = null, holder = null;
	function plain() {
		if (dx || dy) item.translate(dx, dy);
		if (doScale) item.resize(Number(scalePct), Number(scalePct), true, true, true, true, Number(scalePct), scaleAbout || Transformation.CENTER);
		return item;
	}
	try {
		sym = doc.symbols.add(item);
		sym.name = symName;
		inst = layer.symbolItems.add(sym);
		inst.move(item, ElementPlacement.PLACEBEFORE);
		inst.position = item.position;
		if (dx || dy) inst.translate(dx, dy);
		if (doScale) inst.resize(Number(scalePct), Number(scalePct), true, true, true, true, Number(scalePct), scaleAbout || Transformation.CENTER);
		inst.breakLink();
		inst = null;
		/* breakLink puts the art in a new sublayer named after the symbol — find it, lift the art out. */
		for (var i = 0; i < layer.layers.length; i++) {
			if (layer.layers[i].name === symName) { holder = layer.layers[i]; break; }
		}
		if (!holder || holder.pageItems.length < 1) throw new Error("breakLink result not found");
		var result = holder.pageItems[0];
		if (holder.pageItems.length > 1) {
			var grp = layer.groupItems.add();
			while (holder.pageItems.length) holder.pageItems[holder.pageItems.length - 1].move(grp, ElementPlacement.PLACEATBEGINNING);
			result = grp;
		}
		result.move(item, ElementPlacement.PLACEBEFORE);
		try { holder.remove(); } catch (eH) { }
		try { sym.remove(); } catch (eS) { }
		item.remove();
		try { result.name = name; } catch (eN) { }
		return result;
	} catch (e) {
		try { if (inst) inst.remove(); } catch (eI) { }
		try { if (holder) holder.remove(); } catch (eH2) { }
		try { if (sym) sym.remove(); } catch (eS2) { }
		try { appendLeapSepLog("lcsMaskSafeTransform fell back to a plain transform: " + (e.message || e)); } catch (eL) { }
		return plain();
	}
}
`;
