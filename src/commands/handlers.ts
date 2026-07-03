import * as vscode from 'vscode';
import { Settings, LeanCoderMode } from '../configuration/settings';
import { AuditEngine } from '../services/auditEngine';
import { BenchmarkEngine } from '../services/benchmarkEngine';
import { WorkspaceScanner } from '../services/scanner';
import { Logger } from '../logging/logger';

export class CommandHandlers {
    public static register(context: vscode.ExtensionContext): void {
        context.subscriptions.push(
            vscode.commands.registerCommand('leancoder.lite', () => this.handleSetMode('lite')),
            vscode.commands.registerCommand('leancoder.full', () => this.handleSetMode('full')),
            vscode.commands.registerCommand('leancoder.ultra', () => this.handleSetMode('ultra')),
            vscode.commands.registerCommand('leancoder.audit', () => this.handleAudit()),
            vscode.commands.registerCommand('leancoder.benchmark', () => this.handleBenchmark()),
            vscode.commands.registerCommand('leancoder.explain', () => this.handleExplain()),
            vscode.commands.registerCommand('leancoder.review', () => this.handleReview()),
            vscode.commands.registerCommand('leancoder.simplify', () => this.handleCodeMutation('simplify')),
            vscode.commands.registerCommand('leancoder.optimize', () => this.handleCodeMutation('optimize'))
        );
    }

    private static async handleSetMode(mode: LeanCoderMode): Promise<void> {
        await Settings.setMode(mode);
        vscode.window.showInformationMessage(`LeanCoder: Mode set to ${mode.toUpperCase()}`);
    }

    private static async handleAudit(): Promise<void> {
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "LeanCoder: Auditing repository...",
            cancellable: false
        }, async () => {
            const report = await AuditEngine.runAudit();
            const markdown = AuditEngine.formatReportMarkdown(report);
            await this.openMarkdownDocument('LeanCoder_Audit_Report.md', markdown);
        });
    }

    private static async handleBenchmark(): Promise<void> {
        const markdown = BenchmarkEngine.getCumulativeReportMarkdown();
        await this.openMarkdownDocument('LeanCoder_Benchmark_Stats.md', markdown);
    }

    private static async handleExplain(): Promise<void> {
        const explanation = `
# 🧘 LeanCoder coding philosophy

LeanCoder is a coding philosophy layer that intercepts prompts, scans workspace context, applies YAGNI/KISS rules, and optimizes diffs.

## 📜 Core Tenets
- **Prefer Deletion**: Code is liability. Delete unused or over-engineered code.
- **YAGNI (You Aren't Gonna Need It)**: Do not create abstractions for future features.
- **KISS (Keep It Simple, Stupid)**: Write flat, linear, easy-to-read code. Avoid deep nesting.
- **DRY is secondary to Simplicity**: A tiny amount of duplication is better than a bad abstraction.
- **Prefer Standard Library**: Do not add dependencies for things the language platform can already do.
- **Minimize Diffs**: Your code solutions should introduce the absolute minimum working diff.

## 🎚️ Modes
- **Lite**: Mild reminders, helps guide standard AI models without massive prompt alterations.
- **Full (Default)**: Normal YAGNI, standard library focus, early returns, clean layout constraints.
- **Ultra (Aggressive)**: Heavy focus on code deletions, flattens nesting, challenges every single function/class structure.
`;
        await this.openMarkdownDocument('LeanCoder_Philosophy.md', explanation.trim());
    }

    private static async handleReview(): Promise<void> {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('LeanCoder: No active file found to review.');
            return;
        }

        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `LeanCoder: Reviewing ${pathBasename(editor.document.fileName)}...`,
            cancellable: false
        }, async () => {
            const context = await WorkspaceScanner.scan();
            if (!context.activeFile) {
                return;
            }

            const models = await vscode.lm.selectChatModels();
            if (models.length === 0) {
                vscode.window.showErrorMessage('LeanCoder: No AI models available.');
                return;
            }

            const model = models[0];
            const systemPrompt = `You are an expert code reviewer. Review the provided file for cyclomatic complexity, deep nesting, duplicate code, or opportunities to simplify abstractions/delete dead code. Return your review in markdown format.`;
            const prompt = `Review this file:\nFile: ${context.activeFile.relativePath}\nLanguage: ${context.activeFile.languageId}\n\n\`\`\`\n${context.activeFile.content}\n\`\`\``;

            const messages = [
                vscode.LanguageModelChatMessage.User(systemPrompt),
                vscode.LanguageModelChatMessage.User(prompt)
            ];

            const response = await model.sendRequest(messages, {}, new vscode.CancellationTokenSource().token);
            let reviewText = '';
            for await (const chunk of response.text) {
                reviewText += chunk;
            }

            await this.openMarkdownDocument(`Review_${context.activeFile.fileName}.md`, reviewText);
        });
    }

    private static async handleCodeMutation(type: 'simplify' | 'optimize'): Promise<void> {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage(`LeanCoder: No active editor found to ${type}.`);
            return;
        }

        const document = editor.document;
        const selection = editor.selection;
        const codeText = selection.isEmpty ? document.getText() : document.getText(selection);

        if (!codeText.trim()) {
            vscode.window.showErrorMessage('LeanCoder: Selection is empty.');
            return;
        }

        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `LeanCoder: Running AI ${type} on selection...`,
            cancellable: true
        }, async (_progress, token) => {
            try {
                const models = await vscode.lm.selectChatModels();
                if (models.length === 0) {
                    vscode.window.showErrorMessage('LeanCoder: No AI models available.');
                    return;
                }

                const model = models[0];
                const instruction = type === 'simplify' 
                    ? 'Simplify the following code. Inline temporary variables, flatten nested loops/conditionals, use early returns, and remove unnecessary layers of classes or helpers. Keep logic flat and clean.'
                    : 'Optimize the following code for speed and memory efficiency. Ensure it conforms to YAGNI and KISS, avoiding premature architectural patterns.';
                
                const prompt = `${instruction}\nReturn ONLY the clean refactored code without markdown block wrappers or explanations. Do not include markdown code block syntax (like \`\`\`typescript) in your output.\n\nCode:\n${codeText}`;

                const messages = [
                    vscode.LanguageModelChatMessage.User(prompt)
                ];

                const response = await model.sendRequest(messages, {}, token);
                let refactoredCode = '';
                for await (const chunk of response.text) {
                    refactoredCode += chunk;
                }

                if (token.isCancellationRequested) {
                    return;
                }

                // Strip markdown backticks if the model ignored instructions
                let cleanedCode = refactoredCode.trim();
                if (cleanedCode.startsWith('```')) {
                    const lines = cleanedCode.split('\n');
                    if (lines[0].startsWith('```')) {
                        lines.shift();
                    }
                    if (lines[lines.length - 1].startsWith('```')) {
                        lines.pop();
                    }
                    cleanedCode = lines.join('\n');
                }

                // Apply edit
                const targetRange = selection.isEmpty 
                    ? new vscode.Range(0, 0, document.lineCount, 0)
                    : new vscode.Range(selection.start, selection.end);

                await editor.edit(editBuilder => {
                    editBuilder.replace(targetRange, cleanedCode);
                });

                vscode.window.showInformationMessage(`LeanCoder: Successfully applied ${type} changes.`);
            } catch (err) {
                Logger.error(err as Error);
                vscode.window.showErrorMessage(`LeanCoder: Failed to execute code modification: ${(err as Error).message}`);
            }
        });
    }

    private static async openMarkdownDocument(_fileName: string, content: string): Promise<void> {
        const doc = await vscode.workspace.openTextDocument({
            content: content,
            language: 'markdown'
        });
        await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
    }
}

function pathBasename(filePath: string): string {
    const parts = filePath.split(/[\\/]/);
    return parts[parts.length - 1] || filePath;
}
