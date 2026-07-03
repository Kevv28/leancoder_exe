import { LeanCoderSettings, LeanCoderMode } from '../configuration/settings';

export class RuleEngine {
    public static getRulesPrompt(settings: LeanCoderSettings): string {
        const mode = settings.mode;
        
        let rules: string[] = [];

        // Core rules based on user settings toggles
        if (settings.preferDeletion) {
            rules.push('• Prefer DELETING code over adding code. Always check if code can be simplified or removed entirely.');
        }
        if (settings.preferStdlib) {
            rules.push('• Prefer standard library features (stdlib) or native platform APIs. Never add a dependency when native options exist.');
        }
        if (settings.preferNative) {
            rules.push('• Prefer native platform/environment APIs instead of custom wrappers or helper abstractions.');
        }
        if (settings.reuseExisting) {
            rules.push('• Reuse existing project utilities, helpers, validators, middleware, hooks, and components. Do not write duplicate logic.');
        }

        // Standard philosophies
        rules.push('• YAGNI (You Aren\'t Gonna Need It): Never build abstractions or write features for future hypothetical use cases.');
        rules.push('• KISS (Keep It Simple, Stupid): Prefer readable, linear, plain, and straightforward implementations over complex designs.');
        rules.push('• DRY (Don\'t Repeat Yourself) is secondary to YAGNI: Only extract common functions when duplication actually exists and is problematic. A little duplication is better than a bad abstraction.');
        rules.push('• Smallest possible working diff: Your implementation should make the absolute minimum necessary modifications to solve the request.');
        rules.push('• Maintain safety and correctness: Never sacrifice security, accessibility, validation, correctness, or test coverage.');

        // Mode-specific overrides and instructions
        const modePrompt = this.getModeSpecificPrompt(mode);

        const prompt = `
# LeanCoder Core Instructions (Enforced Philosophy)
You are operating with the LeanCoder coding philosophy layer active. You MUST strictly adhere to the following rules:

${rules.map(r => r).join('\n')}

${modePrompt}

# Checklist Before Outputting Code
1. Can this request be solved by DELETING code rather than adding?
2. Did I introduce any premature abstractions? (If yes, inline them)
3. Did I use any external dependencies that could be replaced by the standard library or existing project utilities?
4. Is this the smallest possible diff?
`;
        return prompt.trim();
    }

    private static getModeSpecificPrompt(mode: LeanCoderMode): string {
        switch (mode) {
            case 'lite':
                return `
[Mode: Lite]
- Focus on clean, simple solutions.
- Suggest reuse of existing functions when obvious.
- Do not introduce over-engineered structures.
`;
            case 'ultra':
                return `
[Mode: Ultra - Extreme Deletion & Simplicity]
- CRITICAL: Challenge EVERY abstraction. If a class, interface, helper, or folder is not strictly necessary right now, delete it or merge it.
- Force single-line implementations where readable (e.g. short circuiting, functional pipe).
- Do not build ANY architecture unless there is immediate, indisputable evidence that it is required.
- Aggressively suggest code deletions. If a block of code is dead or can be bypassed, remove it.
- Keep the number of lines of code (LOC) at the absolute minimum.
`;
            case 'full':
            default:
                return `
[Mode: Full - Default Lean Mode]
- Apply strong pressure to keep code lean, flat, and simple.
- Reject new dependencies unless there is absolutely no alternative.
- Simplify nesting: return early, reduce indentation levels, and avoid nested conditionals.
`;
        }
    }
}
