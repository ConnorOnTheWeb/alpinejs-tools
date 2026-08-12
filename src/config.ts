/**
 * config.ts
 *
 * Every setting this extension reads, in one place.
 *
 * Two rules shaped what is here and what isn't.
 *
 * First, defaults reproduce the behaviour of the version before settings
 * existed, exactly. Nothing here is setup you have to do; each one is an
 * escape hatch for a case the extension gets wrong, and an install that never
 * opens settings.json behaves identically to 1.7.5.
 *
 * Second, nothing gets a setting when there is a correct answer. The supported
 * language list is derived from what actually works and is not a user's
 * problem; hover and completions have no failure mode a toggle fixes, because
 * both are triggered by the cursor and neither accumulates anywhere. What is
 * here is the diagnostics — which land in the Problems panel and stay there —
 * and the workspace scan, whose cost depends on a repo's shape in a way no
 * default can know.
 *
 * Settings are read per-resource (`getConfiguration(section, uri)`) rather than
 * globally, so a monorepo can turn a diagnostic off for one package via that
 * folder's `.vscode/settings.json` and leave the rest of the workspace alone.
 */

import * as vscode from 'vscode';

/** Root section for every setting and command this extension contributes. */
export const CONFIG_SECTION = 'alpinejsTools';

/**
 * Maps a severity setting's string value to a `DiagnosticSeverity`.
 * `'off'` maps to `undefined`, which every caller reads as "don't report".
 *
 * `'hint'` is the value that makes this an enum rather than a boolean: it keeps
 * the diagnostic out of the Problems panel while leaving the Quick Fix
 * reachable from the lightbulb, which is what someone hitting a false positive
 * usually wants instead of losing the check altogether.
 */
function toSeverity(value: string): vscode.DiagnosticSeverity | undefined {
	switch (value) {
		case 'error': return vscode.DiagnosticSeverity.Error;
		case 'warning': return vscode.DiagnosticSeverity.Warning;
		case 'information': return vscode.DiagnosticSeverity.Information;
		case 'hint': return vscode.DiagnosticSeverity.Hint;
		default: return undefined; // 'off', or an unrecognised value
	}
}

function read<T>(key: string, fallback: T, resource?: vscode.Uri): T {
	return vscode.workspace
		.getConfiguration(CONFIG_SECTION, resource)
		.get<T>(key, fallback);
}

/**
 * Severity for the unknown-directive warning, or `undefined` when off.
 *
 * This is the heuristic diagnostic — it decides whether an `x-…` token is an
 * attribute name at all — and it is the one with a history of false positives
 * (v1.4.1, v1.6.1, v1.6.2, v1.7.3), so it is the one most likely to want
 * turning down.
 */
export function unknownDirectiveSeverity(
	resource?: vscode.Uri,
): vscode.DiagnosticSeverity | undefined {
	return toSeverity(read('diagnostics.unknownDirective.severity', 'warning', resource));
}

/**
 * Severity for the JSX shorthand warning, or `undefined` when off.
 *
 * Separate from the unknown-directive setting because the two fail differently.
 * This one isn't a heuristic at all: `@click=` in a `.tsx` opening tag is a
 * hard TypeScript syntax error (TS1003), so the extension is replacing a
 * message that doesn't mention Alpine with one that does. Someone silencing
 * the heuristic almost certainly still wants this.
 */
export function jsxShorthandSeverity(
	resource?: vscode.Uri,
): vscode.DiagnosticSeverity | undefined {
	return toSeverity(read('diagnostics.jsxShorthand.severity', 'warning', resource));
}

/**
 * Extra directive base names to treat as valid, from
 * `alpinejsTools.extraDirectives`.
 *
 * The known set is Alpine's core directives plus the six official plugin ones,
 * which is a closed list that can be maintained here. Third-party plugins are
 * not: they register whatever directive name they like, and a project using one
 * gets a permanent warning on correct code with no way to dismiss it. There is
 * no right answer to hardcode, which is exactly when a setting is warranted.
 *
 * Input is normalised so that all of `x-clipboard`, `clipboard` and
 * `x-clipboard:copy` register the base name `clipboard` — the diagnostic
 * compares base names, and asking users to know that is a trap.
 */
export function extraDirectives(resource?: vscode.Uri): Set<string> {
	const raw = read<string[]>('extraDirectives', [], resource);
	const names = new Set<string>();
	if (!Array.isArray(raw)) { return names; }
	for (const entry of raw) {
		if (typeof entry !== 'string') { continue; }
		const base = entry
			.trim()
			.replace(/^x-/, '')   // accept `x-clipboard` or `clipboard`
			.split(':')[0]        // `x-clipboard:copy` → `clipboard`
			.split('.')[0];       // `x-clipboard.once` → `clipboard`
		if (base) { names.add(base); }
	}
	return names;
}

/**
 * Extra glob patterns to keep out of the workspace scan, from
 * `alpinejsTools.workspaceScan.exclude`.
 *
 * This exists instead of a setting for the per-extension file cap. When a scan
 * truncates, the fix a project actually wants is almost never a bigger number —
 * it is to stop reading `dist/`, `vendor/` and bundled output that contain no
 * `Alpine.data()` registration worth finding. Excluding those brings the count
 * under the cap rather than raising the cap, and it makes the scan faster
 * instead of slower.
 */
export function workspaceScanExclude(): string[] {
	const raw = read<string[]>('workspaceScan.exclude', []);
	if (!Array.isArray(raw)) { return []; }
	return raw.filter((g): g is string => typeof g === 'string' && g.trim().length > 0);
}

/** True when `event` touches any setting in this extension's section. */
export function affectsThisExtension(
	event: vscode.ConfigurationChangeEvent,
): boolean {
	return event.affectsConfiguration(CONFIG_SECTION);
}
