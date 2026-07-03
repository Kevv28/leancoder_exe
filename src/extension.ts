import * as vscode from 'vscode';
import { Logger } from './logging/logger';
import { Settings, LeanCoderMode } from './configuration/settings';
import { registerChatParticipant } from './providers/chatParticipant';
import { CommandHandlers } from './commands/handlers';

let statusBarItem: vscode.StatusBarItem;

export function activate(context: vscode.ExtensionContext) {
    // 1. Initialize Logger
    Logger.initialize();
    Logger.info('LeanCoder extension is activating...');

    // 2. Register Chat Participant
    registerChatParticipant(context);

    // 3. Register Commands
    CommandHandlers.register(context);

    // Register auxiliary command for status bar mode toggle
    context.subscriptions.push(
        vscode.commands.registerCommand('leancoder.selectMode', () => selectModeQuickPick())
    );

    // 4. Create and register status bar item
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBarItem.command = 'leancoder.selectMode';
    context.subscriptions.push(statusBarItem);

    // Update status bar initially
    updateStatusBar();

    // Listen to configuration changes to dynamically update status bar
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration((e) => {
            if (e.affectsConfiguration('leancoder.mode')) {
                updateStatusBar();
            }
        })
    );

    statusBarItem.show();
    Logger.info('LeanCoder extension is activated successfully.');
}

export function deactivate() {
    Logger.info('LeanCoder extension is deactivating...');
    if (statusBarItem) {
        statusBarItem.dispose();
    }
}

function updateStatusBar(): void {
    const settings = Settings.get();
    const mode = settings.mode.toUpperCase();
    statusBarItem.text = `$(heart) LeanCoder: ${mode}`;
    statusBarItem.tooltip = `LeanCoder Coding Philosophy: ${mode} mode active. Click to switch.`;
}

async function selectModeQuickPick(): Promise<void> {
    const items: vscode.QuickPickItem[] = [
        {
            label: '$(zap) Lite',
            description: 'Lite Mode',
            detail: 'Subtle guidance, minimal intervention, smaller footprint.'
        },
        {
            label: '$(gear) Full',
            description: 'Full Mode (Default)',
            detail: 'Standard LeanCoder rules (YAGNI, KISS, DRY, prefer stdlib, reduce LOC).'
        },
        {
            label: '$(flame) Ultra',
            description: 'Ultra Mode',
            detail: 'Aggressive constraints: challenge every abstraction, inline functions, prioritize deletion.'
        }
    ];

    const selection = await vscode.window.showQuickPick(items, {
        placeHolder: 'Select LeanCoder Mode'
    });

    if (selection) {
        let mode: LeanCoderMode = 'full';
        if (selection.label.includes('Lite')) {
            mode = 'lite';
        } else if (selection.label.includes('Ultra')) {
            mode = 'ultra';
        }

        await Settings.setMode(mode);
        updateStatusBar();
        vscode.window.showInformationMessage(`LeanCoder mode set to: ${mode.toUpperCase()}`);
    }
}
