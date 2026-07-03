import { Logger } from '../logging/logger';

export interface BenchmarkMetrics {
    linesAdded: number;
    linesRemoved: number;
    dependenciesAdded: string[];
    dependenciesRemoved: string[];
    reusePercent: number;
    stdlibPercent: number;
    maintainabilityDelta: number;
    complexityDelta: number;
    tokenSavings: number;
    costSavingsUsd: number;
}

export class BenchmarkEngine {
    // Session-wide cumulative savings
    private static totalTokensSaved = 0;
    private static totalCostSavedUsd = 0;
    private static totalLinesAdded = 0;
    private static totalLinesRemoved = 0;

    public static recordTokenSavings(unoptimizedLength: number, optimizedLength: number): void {
        const charSavings = Math.max(0, unoptimizedLength - optimizedLength);
        // Estimate 4 characters per token (standard average for English/code)
        const tokenSavings = Math.round(charSavings / 4);
        
        // Assume pricing: $2.50 per million tokens (e.g., Gemini 1.5 Flash / GPT-4o-mini pricing range)
        const costSavings = (tokenSavings / 1_000_000) * 2.50;

        this.totalTokensSaved += tokenSavings;
        this.totalCostSavedUsd += costSavings;

        Logger.info(`Benchmark: Recorded prompt token savings: ${tokenSavings} tokens (~$${costSavings.toFixed(6)})`);
    }

    public static computeMetrics(original: string, updated: string, languageId: string): BenchmarkMetrics {
        const origLines = original.split('\n').map(l => l.trim());
        const newLines = updated.split('\n').map(l => l.trim());

        // Simple line count comparison
        let linesAdded = 0;
        let linesRemoved = 0;

        const origSet = new Set(origLines);
        const newSet = new Set(newLines);

        for (const line of newLines) {
            if (line && !origSet.has(line)) {
                linesAdded++;
            }
        }

        for (const line of origLines) {
            if (line && !newSet.has(line)) {
                linesRemoved++;
            }
        }

        this.totalLinesAdded += linesAdded;
        this.totalLinesRemoved += linesRemoved;

        // Dependencies Added/Removed
        const origDeps = this.extractDependencies(original, languageId);
        const newDeps = this.extractDependencies(updated, languageId);

        const dependenciesAdded = newDeps.filter(d => !origDeps.includes(d));
        const dependenciesRemoved = origDeps.filter(d => !newDeps.includes(d));

        // Reuse percentage estimation
        // Look at how many standard statements or existing variables/functions are referenced
        const totalWords = newLines.join(' ').split(/\s+/).length || 1;
        // In a real project, we estimate based on identifier analysis. Statically, we estimate:
        const reusePercent = Math.max(0, Math.min(100, Math.round((1 - (linesAdded / Math.max(1, newLines.length))) * 100)));

        // Stdlib utilization percentage
        const stdlibKeywords = ['fs', 'path', 'crypto', 'os', 'http', 'https', 'sys', 'os', 'math', 'json', 'datetime', 'collections', 'itertools', 'urllib', 'fetch', 'url', 'URL', 'Date', 'Math', 'JSON', 'Map', 'Set'];
        let stdlibCount = 0;
        const allNewText = newLines.join(' ');
        for (const word of stdlibKeywords) {
            const regex = new RegExp(`\\b${word}\\b`, 'g');
            const matches = allNewText.match(regex);
            if (matches) {
                stdlibCount += matches.length;
            }
        }
        const stdlibPercent = Math.min(100, Math.round((stdlibCount / Math.max(1, totalWords / 15)) * 100));

        // Complexity & Maintainability deltas
        const origComplexity = this.estimateComplexity(original);
        const newComplexity = this.estimateComplexity(updated);
        const complexityDelta = newComplexity - origComplexity;

        // Maintainability increases if complexity goes down or code length decreases
        const maintainabilityDelta = (origLines.length - newLines.length) * 0.5 - complexityDelta * 2.0;

        return {
            linesAdded,
            linesRemoved,
            dependenciesAdded,
            dependenciesRemoved,
            reusePercent,
            stdlibPercent,
            maintainabilityDelta,
            complexityDelta,
            tokenSavings: 0, // Computed at prompt build time, not code gen
            costSavingsUsd: 0
        };
    }

    private static extractDependencies(code: string, languageId: string): string[] {
        const deps: string[] = [];
        if (languageId === 'typescript' || languageId === 'javascript') {
            const matches = code.matchAll(/from\s+['"](.*)['"]|require\(\s*['"](.*)['"]\s*\)/g);
            for (const match of matches) {
                const dep = match[1] || match[2];
                if (dep && !dep.startsWith('.')) {
                    deps.push(dep);
                }
            }
        } else if (languageId === 'python') {
            const matches = code.matchAll(/import\s+(\w+)|from\s+(\w+)\s+import/g);
            for (const match of matches) {
                const dep = match[1] || match[2];
                if (dep) {
                    deps.push(dep);
                }
            }
        }
        return Array.from(new Set(deps));
    }

    private static estimateComplexity(code: string): number {
        let points = 0;
        const keywords = [/\bif\b/g, /\bfor\b/g, /\bwhile\b/g, /\bcatch\b/g, /\bswitch\b/g, /&&/g, /\|\|/g];
        for (const regex of keywords) {
            const matches = code.match(regex);
            if (matches) {
                points += matches.length;
            }
        }
        return points;
    }

    public static getCumulativeReportMarkdown(): string {
        const estimatedCostSaved = this.totalCostSavedUsd;
        
        return `
# 📊 LeanCoder Session Benchmark Metrics

Here are your cumulative lean coding stats for the current session:

### 📈 Codebase Impact
- **Lines of Code Added**: \`+${this.totalLinesAdded}\` lines
- **Lines of Code Removed**: \`-${this.totalLinesRemoved}\` lines
- **Net Codebase Growth**: \`${this.totalLinesAdded - this.totalLinesRemoved}\` lines (negative is ideal!)

### 🪙 Resource & API Savings
- **Estimated Prompt Tokens Saved**: \`${this.totalTokensSaved.toLocaleString()}\` tokens
- **Estimated Prompt API Cost Saved**: \`$${estimatedCostSaved.toFixed(5)}\` USD

Keep keeping your codebase small, clean, and abstraction-free!
`.trim();
    }
}
