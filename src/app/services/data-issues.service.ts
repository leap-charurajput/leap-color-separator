import { Injectable } from '@angular/core';

/**
 * A data problem the user has to fix in their FILES, not in the panel — a missing team JSON, an
 * unreadable LEAP server path, a swatch the grid could not resolve.
 */
export interface DataIssue {
	/** Stable key: re-reporting the same id replaces the entry instead of stacking duplicates. */
	id: string;
	/** One line, plain language, naming what is missing. */
	message: string;
	/** Optional second line: the path / value that failed, for someone who wants to go look. */
	detail?: string;
	/*
	 * The document this issue is ABOUT, when that is not the document active at the moment it is
	 * reported. Prepare reports on the SEP document it just created while the version document is still
	 * the scope, and the switch to the SEP document a moment later used to wipe the message before
	 * anyone could read it. A scoped issue survives the change TO its document and goes away on a
	 * change to any other one.
	 */
	scope?: string;
}

/*
 * Collects data problems for the red banner in the panel shell.
 *
 * These used to surface only in leap_seps.log: a job whose team JSON was missing just showed the
 * non-LEAP UI, and a grid label that could not resolve its swatch silently printed in [Registration].
 * Both look like the panel working normally, so nobody went looking until output was wrong.
 *
 * Issues are keyed so a repeated check (every document activate, every SEP table write) refreshes
 * the entry rather than appending. Dismissing hides an issue until it is reported for a DIFFERENT
 * document — dismissal is per document, so the warning comes back when it becomes relevant again.
 */
@Injectable({ providedIn: 'root' })
export class DataIssuesService {
	/** Bound directly by the banner; mutated in place so Angular's default CD picks it up. */
	readonly issues: DataIssue[] = [];

	private dismissed = new Set<string>();
	private scopeKey = '';

	/*
	 * Document scope. Switching documents clears both the issues and what was dismissed: the previous
	 * document's problems say nothing about this one, and a dismissal should not hide a real problem
	 * on a file the user has not seen yet.
	 */
	setScope(key: string): void {
		const next = String(key || '');
		if (next === this.scopeKey) {
			return;
		}
		this.scopeKey = next;
		this.dismissed.clear();
		/* Keep only issues that belong to the document now in scope (see DataIssue.scope). */
		const keep = this.issues.filter((issue) => !!issue.scope && this.sameDocument(issue.scope, next));
		this.issues.length = 0;
		this.issues.push(...keep);
	}

	private sameDocument(a: string, b: string): boolean {
		const norm = (p: string) => String(p || '').replace(/\\/g, '/').trim().toLowerCase();
		return !!norm(a) && norm(a) === norm(b);
	}

	report(id: string, message: string, detail?: string, scope?: string): void {
		if (!id || !message || this.dismissed.has(id)) {
			return;
		}
		const existing = this.issues.find((issue) => issue.id === id);
		if (existing) {
			existing.message = message;
			existing.detail = detail;
			existing.scope = scope;
			return;
		}
		this.issues.push({ id, message, detail, scope });
	}

	clear(id: string): void {
		const index = this.issues.findIndex((issue) => issue.id === id);
		if (index !== -1) {
			this.issues.splice(index, 1);
		}
	}

	dismiss(id: string): void {
		this.dismissed.add(id);
		this.clear(id);
	}

	clearAll(): void {
		this.issues.length = 0;
	}

	get hasIssues(): boolean {
		return this.issues.length > 0;
	}
}
