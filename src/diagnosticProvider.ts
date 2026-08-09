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
 * In JSX-family documents the scan is additionally restricted to spans that
 * are structurally inside a JSX opening tag (see jsxContext.ts), because there
 * the rest of the document is JavaScript and expressions like `x-y > 0` match
 * the directive regex by coincidence.
 *
 * Diagnostics are debounced (500 ms) to avoid firing on every keystroke.
 */

import * as vscode from 'vscode';
import { ALPINE_LANGUAGES_SET, isJsxLanguage } from './constants';
import { isInRanges, type JsxTagRange } from './jsxContext';
import { jsxTagRangesFor } from './jsxDocument';

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
	'trap',       // @alpinejs/focus (directive is `x-trap`, not `x-focus`)
	'anchor',     // @alpinejs/anchor
	// @alpinejs/morph and @alpinejs/persist expose JS APIs, not directives ($persist is a magic property, handled in extension.ts).
]);

// Matches `x-something`, `x-on:click`, `x-bind:class`, `x-transition.enter`
// (?<=\s) requires whitespace before x- so mid-word occurrences like `translate-x-1/2`
// are skipped. (?=[=\s>]|$) requires the directive to be followed by `=`, whitespace,
// `>`, or end-of-string — ruling out class fragments like `x-1/2` (followed by `/`).
const ALPINE_DIRECTIVE_RE = /(?<=\s)x-([\w][\w-]*(?:[:.][^\s=>'"]*)?)(?=[=\s>]|$)/g;

/** Pre-built flat array of all valid directive base names for suggestion lookup. */
const ALL_DIRECTIVES = [...CORE_DIRECTIVES, ...PLUGIN_DIRECTIVES];

// Matches Alpine's `@event` / `:attr` shorthand used as a JSX attribute name.
// Only ever applied inside a JSX opening tag, so the surrounding context is
// already known to be an attribute position. Requires a following `=` so that
// a spread (`{...props}`) or a bare `:` can't match.
// Group 1 = sigil, group 2 = the name after it.
const ALPINE_SHORTHAND_RE = /(?<=\s)([@:])([\w:.-]+)(?=\s*=)/g;

/** `@click.prevent` → `x-on:click.prevent`; `:class` → `x-bind:class`. */
function expandShorthand(sigil: string, name: string): string {
	return sigil === '@' ? `x-on:${name}` : `x-bind:${name}`;
}

function buildShorthandDiagnostic(
	document: vscode.TextDocument,
	match: RegExpExecArray,
): vscode.Diagnostic {
	const [full, sigil, name] = match;
	const long = expandShorthand(sigil, name);
	const diag = new vscode.Diagnostic(
		new vscode.Range(
			document.positionAt(match.index),
			document.positionAt(match.index + full.length),
		),
		`\`${full}\` is not a valid JSX attribute name — Alpine's ` +
			`${sigil} shorthand only works in HTML templates. Use \`${long}\` instead.`,
		vscode.DiagnosticSeverity.Warning,
	);
	diag.source = 'Alpine.js Tools';
	diag.code = 'jsx-shorthand';
	return diag;
}

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

const DEBOUNCE_MS = 500;

export function createAlpineDiagnosticProvider(
	context: vscode.ExtensionContext,
): vscode.DiagnosticCollection {
	const collection =
		vscode.languages.createDiagnosticCollection('alpinejs-tools');

	const timers = new Map<string, NodeJS.Timeout>();

	function diagnose(document: vscode.TextDocument): void {
		if (!ALPINE_LANGUAGES_SET.has(document.languageId)) { return; }

		const text = document.getText();
		const diagnostics: vscode.Diagnostic[] = [];

		// In JSX the whole document is JavaScript, so `x-…` shaped matches turn
		// up in ordinary code — `const diff = x-y > 0` matches the directive
		// regex exactly. Restrict reporting to spans that are structurally
		// inside a JSX opening tag, the only place a directive can appear.
		const tagRanges: JsxTagRange[] | undefined =
			isJsxLanguage(document.languageId) ? jsxTagRangesFor(document) : undefined;

		ALPINE_DIRECTIVE_RE.lastIndex = 0;
		let match: RegExpExecArray | null;

		while ((match = ALPINE_DIRECTIVE_RE.exec(text)) !== null) {
			if (tagRanges && !isInRanges(tagRanges, match.index)) { continue; }
			const base = getBaseDirective(match[1]);
			if (!CORE_DIRECTIVES.has(base) && !PLUGIN_DIRECTIVES.has(base)) {
				diagnostics.push(buildDiagnostic(document, match, base));
			}
		}

		// JSX only: Alpine's `@event` / `:attr` shorthands aren't valid JSX
		// attribute names. TypeScript already refuses to parse them, but it
		// reports `TS1003 Identifier expected` pointing at the `@`, which says
		// nothing about Alpine and offers no way forward. Name the actual
		// problem and let the code action rewrite it to the long form.
		if (tagRanges) {
			ALPINE_SHORTHAND_RE.lastIndex = 0;
			let sh: RegExpExecArray | null;
			while ((sh = ALPINE_SHORTHAND_RE.exec(text)) !== null) {
				if (!isInRanges(tagRanges, sh.index)) { continue; }
				diagnostics.push(buildShorthandDiagnostic(document, sh));
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
