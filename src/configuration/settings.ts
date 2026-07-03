import * as vscode from 'vscode';

export type LeanCoderMode = 'lite' | 'full' | 'ultra';

export interface LeanCoderSettings {
    mode: LeanCoderMode;
    autoInject: boolean;
    optimizePrompt: boolean;
    scanWorkspace: boolean;
    analyzeDiff: boolean;
    reuseExisting: boolean;
    preferStdlib: boolean;
    preferNative: boolean;
    preferDeletion: boolean;
}

export class Settings {
    public static get(): LeanCoderSettings {
        const config = vscode.workspace.getConfiguration('leancoder');
        return {
            mode: config.get<LeanCoderMode>('mode', 'full'),
            autoInject: config.get<boolean>('autoInject', true),
            optimizePrompt: config.get<boolean>('optimizePrompt', true),
            scanWorkspace: config.get<boolean>('scanWorkspace', true),
            analyzeDiff: config.get<boolean>('analyzeDiff', true),
            reuseExisting: config.get<boolean>('reuseExisting', true),
            preferStdlib: config.get<boolean>('preferStdlib', true),
            preferNative: config.get<boolean>('preferNative', true),
            preferDeletion: config.get<boolean>('preferDeletion', true),
        };
    }

    public static async setMode(mode: LeanCoderMode): Promise<void> {
        const config = vscode.workspace.getConfiguration('leancoder');
        await config.update('mode', mode, vscode.ConfigurationTarget.Global);
    }

    public static async update(key: keyof LeanCoderSettings, value: unknown): Promise<void> {
        const config = vscode.workspace.getConfiguration('leancoder');
        await config.update(key, value, vscode.ConfigurationTarget.Global);
    }
}
