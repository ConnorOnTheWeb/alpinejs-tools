/**
 * codeActionProvider.ts
 *
 * Provides a "Replace with `x-foo`" Quick Fix action for every
 * `unknown-directive` diagnostic emitted by diagnosticProvider.ts.
 *
 * When Alpine.js Tools raises a warning like:
 *   "Unknown Alpine.js directive 'x-dat'. Did you mean `x-data`?"
 * the user sees a lightbulb action that applies the suggested replacement
 * in one click.
 */

import * as vscode from 'vscode';

// Extracts the suggestion from a diagnostic message such as:
//   "Unknown Alpine.js directive 'x-dat'. Did you mean `x-data`?"
const DID_YOU_MEAN_RE = /Did you mean `(x-[\w-]+)`/;

const ALPINE_LANGUAGES = ['html', 'ejs', 'php', 'twig', 'nunjucks', 'blade'];

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
							diag.code !== 'unknown-directive'
						) {
							continue;
						}

						const match = DID_YOU_MEAN_RE.exec(diag.message);
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
