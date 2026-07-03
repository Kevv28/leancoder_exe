import { Logger } from '../logging/logger';

export interface DiffSuggestion {
    type: 'stdlib' | 'nesting' | 'dependency' | 'redundancy' | 'reuse';
    message: string;
    line?: number;
    severity: 'info' | 'warning' | 'critical';
}

export class DiffAnalyzer {
    public static analyze(_originalCode: string, generatedCode: string, languageId: string): DiffSuggestion[] {
        Logger.info('Analyzing diff for optimizations...');
        const suggestions: DiffSuggestion[] = [];

        // 1. Extract code blocks from the generated markdown if it's markdown
        const codeBlocks = this.extractCodeBlocks(generatedCode, languageId);
        const codeToAnalyze = codeBlocks.length > 0 ? codeBlocks.join('\n') : generatedCode;

        // 2. Scan for unnecessary dependency imports
        this.checkUnnecessaryImports(codeToAnalyze, suggestions);

        // 3. Scan for nesting complexity
        this.checkNestingComplexity(codeToAnalyze, suggestions);

        // 4. Scan for redundant expressions
        this.checkRedundantExpressions(codeToAnalyze, suggestions);

        // 5. Scan for standard library alternatives
        this.checkStdlibAlternatives(codeToAnalyze, languageId, suggestions);

        // 6. Look for function size
        this.checkFunctionLengths(codeToAnalyze, suggestions);

        return suggestions;
    }

    private static extractCodeBlocks(markdown: string, languageId: string): string[] {
        const blocks: string[] = [];
        // Regex to match code blocks with optional language specifier
        const regex = new RegExp(`\`\`\`(?:${languageId}|[a-zA-Z0-9_-]+)?\\s*([\\s\\S]*?)\`\`\``, 'g');
        let match;
        while ((match = regex.exec(markdown)) !== null) {
            blocks.push(match[1]);
        }
        return blocks;
    }

    private static checkUnnecessaryImports(code: string, suggestions: DiffSuggestion[]): void {
        const jsImports = code.match(/import\s+.*\s+from\s+['"](.*)['"]/g) || [];
        const jsRequires = code.match(/require\s*\(\s*['"](.*)['"]\s*\)/g) || [];
        
        const imports = [...jsImports, ...jsRequires];
        
        const flags = [
            { name: 'lodash', alt: 'native Array methods (map, filter, reduce) or Object.assign' },
            { name: 'underscore', alt: 'native Array methods' },
            { name: 'axios', alt: 'native fetch API' },
            { name: 'request', alt: 'native fetch API' },
            { name: 'jquery', alt: 'native document.querySelector/querySelectorAll' },
            { name: 'moment', alt: 'native Date object or Intl.DateTimeFormat' },
            { name: 'ramda', alt: 'native JS methods' }
        ];

        for (const imp of imports) {
            for (const flag of flags) {
                if (imp.includes(flag.name)) {
                    suggestions.push({
                        type: 'dependency',
                        severity: 'warning',
                        message: `Avoid importing '${flag.name}'. Use ${flag.alt} instead to keep the project dependency-free.`
                    });
                }
            }
        }
    }

    private static checkNestingComplexity(code: string, suggestions: DiffSuggestion[]): void {
        const lines = code.split('\n');
        let nestedCount = 0;
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const leadingSpaces = line.length - line.trimStart().length;
            const depth = leadingSpaces / (line.includes('\t') ? 1 : 4);

            if (depth >= 4 && !line.trim().startsWith('//') && !line.trim().startsWith('*')) {
                nestedCount++;
                if (nestedCount === 1) { // Only log once to avoid cluttering
                    suggestions.push({
                        type: 'nesting',
                        severity: 'warning',
                        line: i + 1,
                        message: `Nesting depth of ${Math.round(depth)} detected at line ${i + 1}. Consider returning early or refactoring into smaller, flat functions.`
                    });
                }
            }
        }
    }

    private static checkRedundantExpressions(code: string, suggestions: DiffSuggestion[]): void {
        const redundancies = [
            { pattern: /if\s*\((.*?)\)\s*{\s*return\s+true;?\s*}\s*else\s*{\s*return\s+false;?\s*}/g, replacement: 'return Boolean($1);' },
            { pattern: /let\s+(\w+)\s*=\s*new\s+Array\(\)/g, replacement: 'const $1 = [];' },
            { pattern: /let\s+(\w+)\s*=\s*new\s+Object\(\)/g, replacement: 'const $1 = {};' },
            { pattern: /===\s*true/g, replacement: 'simplify comparison (remove "=== true")' },
            { pattern: /===\s*false/g, replacement: 'negate condition (use "!")' }
        ];

        for (const item of redundancies) {
            if (item.pattern.test(code)) {
                suggestions.push({
                    type: 'redundancy',
                    severity: 'info',
                    message: `Redundant expression detected: replace with \`${item.replacement}\` to simplify code.`
                });
            }
        }
    }

    private static checkStdlibAlternatives(code: string, languageId: string, suggestions: DiffSuggestion[]): void {
        if (languageId === 'typescript' || languageId === 'javascript') {
            if (code.includes('Math.pow')) {
                suggestions.push({
                    type: 'stdlib',
                    severity: 'info',
                    message: 'Use the exponentiation operator `**` instead of `Math.pow`.'
                });
            }
            if (code.includes('indexOf') && !code.includes('lastIndexOf')) {
                suggestions.push({
                    type: 'stdlib',
                    severity: 'info',
                    message: 'Use `.includes()` instead of `.indexOf() !== -1` for better readability.'
                });
            }
        } else if (languageId === 'python') {
            if (code.includes('.keys()') && code.includes('in ')) {
                suggestions.push({
                    type: 'stdlib',
                    severity: 'info',
                    message: 'Avoid calling `.keys()` when checking for membership in a dictionary (e.g. `key in dict`).'
                });
            }
            if (code.includes('range(len(')) {
                suggestions.push({
                    type: 'stdlib',
                    severity: 'info',
                    message: 'Use `enumerate()` instead of `range(len(sequence))` when you need both indexes and elements.'
                });
            }
        }
    }

    private static checkFunctionLengths(code: string, suggestions: DiffSuggestion[]): void {
        const functions = code.match(/function\s+\w+\s*\(.*?\)\s*\{([\s\S]*?)\}/g) || [];
        for (const fn of functions) {
            const linesCount = fn.split('\n').length;
            if (linesCount > 40) {
                suggestions.push({
                    type: 'reuse',
                    severity: 'warning',
                    message: `Large function block (${linesCount} lines) generated. Consider breaking it down or reusing smaller helpers.`
                });
            }
        }
    }

    public static formatSuggestionsMarkdown(suggestions: DiffSuggestion[]): string {
        if (suggestions.length === 0) {
            return '';
        }

        const lines = [
            '\n---',
            '### 🔍 LeanCoder Diff Review Suggestions',
            'LeanCoder has identified the following areas to reduce complexity or LOC:',
            ''
        ];

        for (const sug of suggestions) {
            const badge = sug.severity === 'critical' ? '🔴 **CRITICAL**' : sug.severity === 'warning' ? '⚠️ **WARNING**' : 'ℹ️ **INFO**';
            const lineStr = sug.line ? ` (Line ${sug.line})` : '';
            lines.push(`- ${badge}${lineStr}: ${sug.message}`);
        }

        lines.push('\n*(Apply these recommendations to keep the codebase simple and dependency-free)*');
        return lines.join('\n');
    }
}
