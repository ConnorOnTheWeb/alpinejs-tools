/**
 * diagnosticProvider.ts
 *
 * Reports unknown Alpine.js directives as warnings.
 *
 * Strategy
 * ────────
 * Scan each open document for `x-*` attribute occurrences using a regex.
 * Extract the base directive name (the part before `:` or `.`) and check it
 * against the known-directives set. Unknown names produce a Warning diagnostic
 * so that common typos (`x-dat`, `x-models`) are caught immediately.
 *
 * Official Alpine plugin directives (`x-intersect`, `x-collapse`, etc.) are
 * recognised and never flagged, even without the plugin package present.
 *
 * Diagnostics are debounced (500 ms) to avoid firing on every keystroke.
 */

import * as vscode from 'vscode';

// ─── Known directive sets ─────────────────────────────────────────────────────

/** Core Alpine.js v3 directives (the part after `x-`). */
const CORE_DIRECTIVES = new Set([
	'data', 'init', 'show', 'bind', 'on', 'text', 'html',
	'model', 'modelable', 'for', 'transition', 'effect',
	'ignore', 'ref', 'cloak', 'teleport', 'if', 'id',
]);

/**
 * Official Alpine.js plugin directives. These are always treated as valid
 * regardless of whether the plugin package is installed.
 */
const PLUGIN_DIRECTIVES = new Set([
	'intersect',  // @alpinejs/intersect
	'collapse',   // @alpinejs/collapse
	'sort',       // @alpinejs/sort
	'mask',       // @alpinejs/mask
	'morph',      // @alpinejs/morph
	'focus',      // @alpinejs/focus
	'persist',    // @alpinejs/persist
	'anchor',     // @alpinejs/anchor
]);

// Matches `x-something`, `x-on:click`, `x-bind:class`, `x-transition.enter`
// Stops at = > ' " or whitespace so the match covers only the attribute name.
const ALPINE_DIRECTIVE_RE = /\bx-([\w][\w-]*(?:[:.][^\s=>'"]*)?)/g;

/** Pre-built flat array of all valid directive base names for suggestion lookup. */
const ALL_DIRECTIVES = [...CORE_DIRECTIVES, ...PLUGIN_DIRECTIVES];

function getBaseDirective(raw: string): string {
	// 'on:click.prevent' → 'on'
	// 'transition.enter' → 'transition'
	// 'bind:class'       → 'bind'
	// 'data'             → 'data'
	return raw.split(':')[0].split('.')[0];
}

function buildDiagnostic(
	document: vscode.TextDocument,
	match: RegExpExecArray,
	base: string,
): vscode.Diagnostic {
	const start = document.positionAt(match.index);
	const end = document.positionAt(match.index + match[0].length);
	const range = new vscode.Range(start, end);

	// Search both core and plugin directives; prefer shortest edit distance.
	// Require at least a 2-character shared prefix (1-char for length-1 bases)
	// to avoid false positives like x-modl → x-mask instead of x-model.
	const prefixLen = Math.min(base.length, 2);
	const basePrefix = base.slice(0, prefixLen);
	let closest: string | undefined;
	let bestDist = Infinity;
	for (const d of ALL_DIRECTIVES) {
		if (!d.startsWith(basePrefix)) { continue; }
		const dist = Math.abs(d.length - base.length);
		if (dist <= 2 && dist < bestDist) {
			closest = d;
			bestDist = dist;
		}
	}

	const hint = closest
		? ` Did you mean \`x-${closest}\`?`
		: ` Valid directives: ${[...CORE_DIRECTIVES].join(', ')}.`;

	const diag = new vscode.Diagnostic(
		range,
		`Unknown Alpine.js directive 'x-${base}'.${hint}`,
		vscode.DiagnosticSeverity.Warning,
	);
	diag.source = 'Alpine.js Tools';
	diag.code = 'unknown-directive';
	return diag;
}

// ─── Provider ─────────────────────────────────────────────────────────────────

const ALPINE_LANGUAGES = new Set([
	'html', 'ejs', 'php', 'twig', 'nunjucks', 'blade',
]);

const DEBOUNCE_MS = 500;

export function createAlpineDiagnosticProvider(
	context: vscode.ExtensionContext,
): vscode.DiagnosticCollection {
	const collection =
		vscode.languages.createDiagnosticCollection('alpinejs-tools');

	const timers = new Map<string, NodeJS.Timeout>();

	function diagnose(document: vscode.TextDocument): void {
		if (!ALPINE_LANGUAGES.has(document.languageId)) { return; }

		const text = document.getText();
		const diagnostics: vscode.Diagnostic[] = [];

		ALPINE_DIRECTIVE_RE.lastIndex = 0;
		let match: RegExpExecArray | null;

		while ((match = ALPINE_DIRECTIVE_RE.exec(text)) !== null) {
			const base = getBaseDirective(match[1]);
			if (!CORE_DIRECTIVES.has(base) && !PLUGIN_DIRECTIVES.has(base)) {
				diagnostics.push(buildDiagnostic(document, match, base));
			}
		}

		collection.set(document.uri, diagnostics);
	}

	function scheduleDiagnose(document: vscode.TextDocument): void {
		const key = document.uri.toString();
		const existing = timers.get(key);
		if (existing !== undefined) { clearTimeout(existing); }
		timers.set(
			key,
			setTimeout(() => {
				diagnose(document);
				timers.delete(key);
			}, DEBOUNCE_MS),
		);
	}

	// Scan all already-open documents immediately
	for (const doc of vscode.workspace.textDocuments) {
		diagnose(doc);
	}

	context.subscriptions.push(
		vscode.workspace.onDidOpenTextDocument(diagnose),
		vscode.workspace.onDidChangeTextDocument(e =>
			scheduleDiagnose(e.document),
		),
		vscode.workspace.onDidCloseTextDocument(doc => {
			collection.delete(doc.uri);
			const t = timers.get(doc.uri.toString());
			if (t !== undefined) { clearTimeout(t); timers.delete(doc.uri.toString()); }
		}),
		collection,
	);

	return collection;
}
