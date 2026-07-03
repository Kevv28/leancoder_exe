import * as assert from 'assert';
import * as vscode from 'vscode';
import { Settings } from '../../src/configuration/settings';

suite('LeanCoder Extension Integration Tests', () => {
    vscode.window.showInformationMessage('Start all integration tests.');

    test('Extension should be present in registries', () => {
        assert.ok(vscode.extensions.getExtension('leancoder-ai.leancoder'));
    });

    test('Extension should activate successfully', async () => {
        const ext = vscode.extensions.getExtension('leancoder-ai.leancoder');
        if (ext) {
            await ext.activate();
            assert.strictEqual(ext.isActive, true);
        }
    });

    test('Extension Settings should load with default values', () => {
        const settings = Settings.get();
        assert.strictEqual(settings.mode, 'full');
        assert.strictEqual(settings.autoInject, true);
        assert.strictEqual(settings.optimizePrompt, true);
    });

    test('Settings setter should update mode correctly', async () => {
        await Settings.setMode('ultra');
        const settings = Settings.get();
        assert.strictEqual(settings.mode, 'ultra');
        
        // Revert to full
        await Settings.setMode('full');
    });
});
