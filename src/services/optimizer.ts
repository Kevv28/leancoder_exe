import { WorkspaceContext } from './scanner';
import { LeanCoderSettings } from '../configuration/settings';
import { RuleEngine } from './rules';
import { Logger } from '../logging/logger';

export class PromptOptimizer {
    public static buildAndOptimizePrompt(
        userPrompt: string,
        context: WorkspaceContext,
        settings: LeanCoderSettings
    ): string {
        Logger.info('Building and optimizing prompt...');

        // 1. Core user request
        const userRequestSection = `
# USER REQUEST
${userPrompt}
`;

        // 2. Active file context
        let activeFileSection = '';
        if (context.activeFile) {
            const file = context.activeFile;
            activeFileSection = `
# ACTIVE EDITOR CONTEXT
- File: \`${file.relativePath}\`
- Language: \`${file.languageId}\`
${file.selection ? `- Selected Lines: ${file.selectionStartLine}-${file.selectionEndLine}\n- Selected Content:\n\`\`\`${file.languageId}\n${file.selection}\n\`\`\`` : ''}

## File Content
\`\`\`${file.languageId}
${file.content}
\`\`\`
`;
        }

        // 3. Workspace instructions & rules
        let workspaceInstructionsSection = '';
        const instructionParts: string[] = [];

        if (context.claude) {
            instructionParts.push(`## CLAUDE.md Guidelines\n${context.claude}`);
        }
        if (context.agents) {
            instructionParts.push(`## AGENTS.md Guidelines\n${context.agents}`);
        }
        if (context.customInstructions) {
            instructionParts.push(`## Custom Workspace Rules\n${context.customInstructions}`);
        }
        if (context.readme && !context.claude && !context.agents) {
            // Include readme if no specific CLAUDE/AGENTS docs exist, but keep it minimal
            instructionParts.push(`## README.md Context\n${context.readme.substring(0, 4000)}`);
        }

        if (instructionParts.length > 0) {
            workspaceInstructionsSection = `
# WORKSPACE RULES & PROJECT CONTEXT
${instructionParts.join('\n\n')}
`;
        }

        // 4. LeanCoder Rules (Coding Philosophy Layer)
        let leancoderRulesSection = '';
        if (settings.autoInject) {
            leancoderRulesSection = RuleEngine.getRulesPrompt(settings);
        }

        // 5. Package dependencies helper info
        let dependencyContext = '';
        if (context.dependencies.length > 0) {
            const depsList = Array.from(new Set(context.dependencies)).slice(0, 50).join(', ');
            dependencyContext = `\n- Detected Project Type: ${context.projectTypes.join(', ') || 'unknown'}\n- Detected Dependencies (reuse these!): ${depsList}\n`;
        }

        // Combine sections in prioritized order:
        // 1. System safety guidelines (implicitly inside leancoder rules)
        // 2. User request
        // 3. Active file context
        // 4. Workspace instructions / Project guidelines
        // 5. LeanCoder rules
        let mergedPrompt = `
${leancoderRulesSection}

${userRequestSection}

${activeFileSection}
${dependencyContext}
${workspaceInstructionsSection}
`;

        // 6. Perform Optimization (if enabled)
        if (settings.optimizePrompt) {
            mergedPrompt = this.optimize(mergedPrompt);
        }

        return mergedPrompt.trim();
    }

    private static optimize(prompt: string): string {
        const originalLength = prompt.length;
        
        // Split prompt into lines
        const lines = prompt.split('\n');
        const optimizedLines: string[] = [];
        const seenRules = new Set<string>();

        for (const line of lines) {
            const trimmed = line.trim();

            // 1. Remove excessive empty lines
            if (trimmed === '') {
                if (optimizedLines.length > 0 && optimizedLines[optimizedLines.length - 1] !== '') {
                    optimizedLines.push('');
                }
                continue;
            }

            // 2. Deduplicate lines that represent identical bullet rules or instructions
            // Only deduplicate bullet points, rules (starting with •, -, *, etc.), or short duplicate sentences
            const isBulletOrRule = /^[•\-*\d+\.]/.test(trimmed) || (trimmed.length < 150 && trimmed.endsWith('.'));
            if (isBulletOrRule) {
                const normalizedRule = trimmed
                    .toLowerCase()
                    .replace(/[^a-z0-9]/g, ''); // strip punctuation and spaces for comparison
                
                if (seenRules.has(normalizedRule)) {
                    continue; // Skip duplicate rule
                }
                seenRules.add(normalizedRule);
            }

            optimizedLines.push(line);
        }

        // Reconstruct optimized prompt
        let optimized = optimizedLines.join('\n');

        // Clean double-newlines
        optimized = optimized.replace(/\n{3,}/g, '\n\n');

        Logger.info(`Prompt optimized. Compressed size: ${optimized.length} characters (Saved ${originalLength - optimized.length} chars).`);
        return optimized;
    }
}
