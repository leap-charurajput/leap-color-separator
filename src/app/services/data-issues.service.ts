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
		this.issues.length = 0;
	}

	report(id: string, message: string, detail?: string): void {
		if (!id || !message || this.dismissed.has(id)) {
			return;
		}
		const existing = this.issues.find((issue) => issue.id === id);
		if (existing) {
			existing.message = message;
			existing.detail = detail;
			return;
		}
		this.issues.push({ id, message, detail });
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
