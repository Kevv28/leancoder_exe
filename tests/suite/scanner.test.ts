import * as assert from 'assert';
import * as vscode from 'vscode';
import { WorkspaceScanner } from '../../src/services/scanner';

suite('LeanCoder Workspace Scanner Tests', () => {
    test('Scanner should scan and return a valid context shape', async () => {
        const context = await WorkspaceScanner.scan();
        assert.ok(context);
        assert.ok(Array.isArray(context.projectTypes));
        assert.ok(Array.isArray(context.dependencies));
    });

    test('Scanner should handle missing documents gracefully', async () => {
        const context = await WorkspaceScanner.scan();
        // Since we are running in an empty or arbitrary workspace, docs like CLAUDE.md might not exist
        // The scanner should still work and return undefined fields, not crash
        assert.strictEqual(typeof context.claude === 'string' || context.claude === undefined, true);
        assert.strictEqual(typeof context.agents === 'string' || context.agents === undefined, true);
    });

    test('Scanner should identify active document context when a file is open', async () => {
        // Open a mock document
        const document = await vscode.workspace.openTextDocument({
            content: 'console.log("hello test");\n// another line of code',
            language: 'javascript'
        });
        await vscode.window.showTextDocument(document);

        const context = await WorkspaceScanner.scan();
        assert.ok(context.activeFile);
        assert.strictEqual(context.activeFile.languageId, 'javascript');
        assert.ok(context.activeFile.content.includes('hello test'));
    });
});
