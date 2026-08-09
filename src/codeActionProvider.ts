/**
 * codeActionProvider.ts
 *
 * Provides a "Replace with `x-foo`" Quick Fix action for the diagnostics
 * emitted by diagnosticProvider.ts.
 *
 * When Alpine.js Tools raises a warning like:
 *   "Unknown Alpine.js directive 'x-dat'. Did you mean `x-data`?"
 * the user sees a lightbulb action that applies the suggested replacement
 * in one click. The same applies to the JSX shorthand warning:
 *   "`@click` is not a valid JSX attribute name … Use `x-on:click` instead."
 */

import * as vscode from 'vscode';
import { ALPINE_LANGUAGES } from './constants';

// Extracts the suggestion from a diagnostic message. Both diagnostic kinds
// put their replacement in backticks after a fixed phrase:
//   "Unknown Alpine.js directive 'x-dat'. Did you mean `x-data`?"
//   "… Use `x-on:click` instead."
const SUGGESTION_RE = /(?:Did you mean|Use) `(x-[\w:.-]+)`/;

/** Diagnostic codes this provider knows how to fix. */
const FIXABLE_CODES = new Set(['unknown-directive', 'jsx-shorthand']);

export function createAlpineCodeActionProvider(
	context: vscode.ExtensionContext,
): void {
	context.subscriptions.push(
		vscode.languages.registerCodeActionsProvider(
			ALPINE_LANGUAGES.map(lang => ({ language: lang })),
			{
				provideCodeActions(
					document: vscode.TextDocument,
					_range: vscode.Range | vscode.Selection,
					actionContext: vscode.CodeActionContext,
				): vscode.CodeAction[] {
					const actions: vscode.CodeAction[] = [];

					for (const diag of actionContext.diagnostics) {
						if (
							diag.source !== 'Alpine.js Tools' ||
							typeof diag.code !== 'string' ||
							!FIXABLE_CODES.has(diag.code)
						) {
							continue;
						}

						const match = SUGGESTION_RE.exec(diag.message);
						if (!match) { continue; }

						const suggestion = match[1]; // e.g. 'x-data'

						const fix = new vscode.CodeAction(
							`Replace with '${suggestion}'`,
							vscode.CodeActionKind.QuickFix,
						);
						fix.diagnostics = [diag];
						fix.edit = new vscode.WorkspaceEdit();
						fix.edit.replace(document.uri, diag.range, suggestion);
						fix.isPreferred = true;

						actions.push(fix);
					}

					return actions;
				},
			},
			{ providedCodeActionKinds: [vscode.CodeActionKind.QuickFix] },
		),
	);
}
