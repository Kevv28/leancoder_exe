import * as vscode from 'vscode';
import { WorkspaceScanner } from '../services/scanner';
import { Settings, LeanCoderMode } from '../configuration/settings';
import { PromptOptimizer } from '../services/optimizer';
import { DiffAnalyzer } from '../services/diff';
import { AuditEngine } from '../services/auditEngine';
import { BenchmarkEngine } from '../services/benchmarkEngine';
import { Logger } from '../logging/logger';

export function registerChatParticipant(context: vscode.ExtensionContext): void {
    Logger.info('Registering LeanCoder Chat Participant...');

    const handler: vscode.ChatRequestHandler = async (
        request: vscode.ChatRequest,
        _chatContext: vscode.ChatContext,
        response: vscode.ChatResponseStream,
        token: vscode.CancellationToken
    ) => {
        try {
            const command = request.command;
            
            // Handle specific subcommands
            if (command === 'lite' || command === 'full' || command === 'ultra') {
                const targetMode = command as LeanCoderMode;
                await Settings.setMode(targetMode);
                response.markdown(`✅ **LeanCoder mode switched to \`${targetMode.toUpperCase()}\` globally.**`);
                return;
            }

            if (command === 'audit') {
                response.progress('Auditing workspace repository for code smells and abstractions...');
                const report = await AuditEngine.runAudit();
                const mdReport = AuditEngine.formatReportMarkdown(report);
                response.markdown(mdReport);
                return;
            }

            if (command === 'benchmark') {
                response.progress('Compiling session benchmark metrics...');
                const mdReport = BenchmarkEngine.getCumulativeReportMarkdown();
                response.markdown(mdReport);
                return;
            }

            if (command === 'explain') {
                response.markdown(getPhilosophyExplanation());
                return;
            }

            // Command: review, simplify, optimize, or general coding prompt
            response.progress('Scanning workspace and active file context...');
            const workspaceContext = await WorkspaceScanner.scan();
            const settings = Settings.get();

            let targetPrompt = request.prompt;

            if (command === 'review') {
                if (!workspaceContext.activeFile) {
                    response.markdown('❌ **No active file found to review. Please open a file first.**');
                    return;
                }
                targetPrompt = `Review the file \`${workspaceContext.activeFile.relativePath}\` for nesting depth, unnecessary helper abstractions, and opportunities to delete redundant code.`;
            } else if (command === 'simplify') {
                if (!workspaceContext.activeFile) {
                    response.markdown('❌ **No active file found to simplify. Please open a file first.**');
                    return;
                }
                const focus = workspaceContext.activeFile.selection ? 'selected code' : 'entire file';
                targetPrompt = `Simplify the ${focus} in \`${workspaceContext.activeFile.relativePath}\`. Reduce lines of code, inline variables, remove layers, and optimize branching.`;
            } else if (command === 'optimize') {
                if (!workspaceContext.activeFile) {
                    response.markdown('❌ **No active file found to optimize. Please open a file first.**');
                    return;
                }
                const focus = workspaceContext.activeFile.selection ? 'selected code' : 'entire file';
                targetPrompt = `Optimize the ${focus} in \`${workspaceContext.activeFile.relativePath}\` for CPU/memory efficiency, while keeping implementation flat and simple (YAGNI/KISS).`;
            }

            // Build optimized prompt
            response.progress('Applying coding philosophy and optimizing prompt...');
            const unoptimizedLength = targetPrompt.length + (workspaceContext.activeFile?.content.length || 0);
            
            const optimizedPrompt = PromptOptimizer.buildAndOptimizePrompt(
                targetPrompt,
                workspaceContext,
                settings
            );

            // Record tokens saved in benchmark engine
            BenchmarkEngine.recordTokenSavings(unoptimizedLength, optimizedPrompt.length);

            // Access language model
            response.progress('Streaming query to Language Model...');
            const models = await vscode.lm.selectChatModels();
            if (models.length === 0) {
                response.markdown('❌ **No AI Language Models available. Make sure GitHub Copilot or Gemini is installed and authorized.**');
                return;
            }

            // Prefer gpt-4o or gemini-pro models if available, otherwise fallback to first
            let model = models[0];
            const preferredFamily = ['gemini-1.5-pro', 'gemini-pro', 'gpt-4o', 'gpt-4'];
            for (const family of preferredFamily) {
                const matchedModels = await vscode.lm.selectChatModels({ family });
                if (matchedModels.length > 0) {
                    model = matchedModels[0];
                    break;
                }
            }

            Logger.info(`Using Language Model: ${model.name} (${model.family})`);

            // Safe message creation (using System if available, otherwise User)
            const messages: vscode.LanguageModelChatMessage[] = [];
            const systemMessage = getSystemInstructionHeader(settings.mode);

            // Check if LanguageModelChatMessage has System static constructor
            if ('System' in vscode.LanguageModelChatMessage) {
                // @ts-ignore: VS Code API version variance safety
                messages.push(vscode.LanguageModelChatMessage.System(systemMessage));
                messages.push(vscode.LanguageModelChatMessage.User(optimizedPrompt));
            } else {
                messages.push(vscode.LanguageModelChatMessage.User(`${systemMessage}\n\n${optimizedPrompt}`));
            }

            // Send request to model
            const chatResponse = await model.sendRequest(messages, {}, token);
            let fullResponseText = '';

            for await (const chunk of chatResponse.text) {
                response.markdown(chunk);
                fullResponseText += chunk;
            }

            // If a code change is proposed, analyze it using the DiffAnalyzer
            if (settings.analyzeDiff && workspaceContext.activeFile) {
                const suggestions = DiffAnalyzer.analyze(
                    workspaceContext.activeFile.selection || workspaceContext.activeFile.content,
                    fullResponseText,
                    workspaceContext.activeFile.languageId
                );

                if (suggestions.length > 0) {
                    const mdSuggestions = DiffAnalyzer.formatSuggestionsMarkdown(suggestions);
                    response.markdown(mdSuggestions);

                    // Compute metrics for benchmarking
                    const metrics = BenchmarkEngine.computeMetrics(
                        workspaceContext.activeFile.selection || workspaceContext.activeFile.content,
                        fullResponseText,
                        workspaceContext.activeFile.languageId
                    );
                    Logger.info(`Benchmark metrics: Added ${metrics.linesAdded}, Removed ${metrics.linesRemoved}`);
                }
            }

        } catch (error) {
            Logger.error(error as Error);
            response.markdown(`❌ **LeanCoder experienced an error processing your request:**\n\`\`\`\n${(error as Error).message}\n\`\`\``);
        }
    };

    const participant = vscode.chat.createChatParticipant('leancoder', handler);
    participant.iconPath = vscode.Uri.joinPath(context.extensionUri, 'icon.png');
}

function getSystemInstructionHeader(mode: string): string {
    return `You are LeanCoder, an expert developer assistant executing in ${mode.toUpperCase()} mode.
Your objective is to provide the leanest, simplest, and most maintainable code.
Strictly avoid adding boilerplate, unnecessary design patterns, new configuration parameters, or extra imports.
Always prefer standard libraries, native language solutions, and code deletions.`;
}

function getPhilosophyExplanation(): string {
    return `
# 🧘 LeanCoder coding philosophy

LeanCoder operates on a simple premise: **Code is liability, not asset.** Every line you add is a line to test, debug, and maintain.

### 📜 Core Tenets

1. **Delete over Add**: If you can solve a problem by removing logic, do that.
2. **YAGNI (You Aren't Gonna Need It)**: Do not create abstractions for future features. Implement ONLY what is needed *right now*.
3. **KISS (Keep It Simple, Stupid)**: Write flat, linear, easy-to-read code. Avoid deep nesting or nested if-statements.
4. **DRY is secondary to Simplicity**: A tiny amount of duplication is better than a bad abstraction.
5. **Prefer Standard Library**: Do not add dependencies for things the language platform can already do.
6. **Minimize Diffs**: Your code solutions should introduce the absolute minimum working diff.

### 🎚️ Modes

- **Lite**: Mild reminders, helps guide standard AI models without massive prompt alterations.
- **Full (Default)**: Normal YAGNI, standard library focus, early returns, clean layout constraints.
- **Ultra (Aggressive)**: Heavy focus on code deletions, flattens nesting, challenges every single function/class structure.
`.trim();
}
