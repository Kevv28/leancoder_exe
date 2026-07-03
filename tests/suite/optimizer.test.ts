import * as assert from 'assert';
import { PromptOptimizer } from '../../src/services/optimizer';
import { WorkspaceContext } from '../../src/services/scanner';
import { LeanCoderSettings } from '../../src/configuration/settings';

suite('LeanCoder Prompt Optimizer Tests', () => {
    const mockSettings: LeanCoderSettings = {
        mode: 'full',
        autoInject: true,
        optimizePrompt: true,
        scanWorkspace: true,
        analyzeDiff: true,
        reuseExisting: true,
        preferStdlib: true,
        preferNative: true,
        preferDeletion: true
    };

    const mockContext: WorkspaceContext = {
        projectTypes: ['node'],
        dependencies: ['lodash', 'express'],
        claude: '• Always use TypeScript.\n• Always write tests.',
        agents: '• Always write tests.\n• Do not use any console.logs.', // 'Always write tests' is a duplicate
        readme: 'Project README information.',
        activeFile: {
            fileName: 'index.js',
            relativePath: 'src/index.js',
            languageId: 'javascript',
            content: 'const express = require("express");'
        }
    };

    test('Optimizer should build a prompt containing user request, rules, and file details', () => {
        const userPrompt = 'Implement a simple express router';
        const finalPrompt = PromptOptimizer.buildAndOptimizePrompt(userPrompt, mockContext, mockSettings);

        assert.ok(finalPrompt.includes('USER REQUEST'));
        assert.ok(finalPrompt.includes('Implement a simple express router'));
        assert.ok(finalPrompt.includes('ACTIVE EDITOR CONTEXT'));
        assert.ok(finalPrompt.includes('index.js'));
        assert.ok(finalPrompt.includes('LeanCoder Core Instructions'));
    });

    test('Optimizer should remove duplicate instructions (like "Always write tests")', () => {
        const userPrompt = 'Test prompt';
        const finalPrompt = PromptOptimizer.buildAndOptimizePrompt(userPrompt, mockContext, mockSettings);

        // Count occurrences of "Always write tests"
        const count = (finalPrompt.match(/Always write tests/gi) || []).length;
        // In the original input, it is present in Claude guidelines and Agents guidelines.
        // It should have been deduplicated to 1 occurrence by the line-level optimizer.
        assert.strictEqual(count, 1);
    });

    test('Optimizer should respect autoInject setting', () => {
        const userPrompt = 'Test prompt';
        const settingsNoInject = { ...mockSettings, autoInject: false };
        const finalPrompt = PromptOptimizer.buildAndOptimizePrompt(userPrompt, mockContext, settingsNoInject);

        assert.strictEqual(finalPrompt.includes('LeanCoder Core Instructions'), false);
    });

    test('Optimizer should bypass compression when optimizePrompt is false', () => {
        const userPrompt = 'Test prompt';
        const settingsNoOpt = { ...mockSettings, optimizePrompt: false };
        const finalPrompt = PromptOptimizer.buildAndOptimizePrompt(userPrompt, mockContext, settingsNoOpt);

        // Without optimization, duplicates should remain intact
        const count = (finalPrompt.match(/Always write tests/gi) || []).length;
        assert.ok(count > 1);
    });
});
