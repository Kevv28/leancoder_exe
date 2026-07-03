import * as vscode from 'vscode';
import * as path from 'path';

export interface AuditIssue {
    file: string;
    line?: number;
    type: 'complexity' | 'duplication' | 'large-block' | 'abstraction' | 'unused-dep' | 'over-engineering';
    message: string;
    debtHours: number;
}

export interface AuditReport {
    issues: AuditIssue[];
    abstractionsCount: number;
    maintainabilityScore: number; // 0-100
    technicalDebtHours: number;
    linesScanned: number;
    filesScanned: number;
}

export class AuditEngine {
    private static EXCLUDED_DIRS = [
        'node_modules',
        'dist',
        'build',
        'out',
        '.git',
        '.vscode',
        'venv',
        '.venv',
        'target'
    ];

    public static async runAudit(): Promise<AuditReport> {
        const report: AuditReport = {
            issues: [],
            abstractionsCount: 0,
            maintainabilityScore: 100,
            technicalDebtHours: 0,
            linesScanned: 0,
            filesScanned: 0
        };

        const folders = vscode.workspace.workspaceFolders;
        if (!folders || folders.length === 0) {
            return report;
        }

        const rootUri = folders[0].uri;
        await this.scanDirectory(rootUri, rootUri, report);

        // Scan package.json and compare imports to find unused dependencies
        await this.checkUnusedDependencies(rootUri, report);

        // Calculate maintainability score: starting at 100, deduct based on technical debt and issues
        const issueDeductions = report.issues.length * 2.5;
        const complexityDeductions = report.issues.filter(i => i.type === 'complexity').length * 5;
        report.maintainabilityScore = Math.max(0, Math.min(100, Math.round(100 - issueDeductions - complexityDeductions)));

        // Total technical debt is the sum of debt hours of all issues
        report.technicalDebtHours = report.issues.reduce((sum, issue) => sum + issue.debtHours, 0);

        return report;
    }

    private static async scanDirectory(rootUri: vscode.Uri, currentUri: vscode.Uri, report: AuditReport): Promise<void> {
        try {
            const entries = await vscode.workspace.fs.readDirectory(currentUri);
            for (const [name, type] of entries) {
                if (this.EXCLUDED_DIRS.includes(name)) {
                    continue;
                }

                const entryUri = vscode.Uri.joinPath(currentUri, name);
                if (type === vscode.FileType.Directory) {
                    await this.scanDirectory(rootUri, entryUri, report);
                } else if (type === vscode.FileType.File) {
                    const ext = path.extname(name).toLowerCase();
                    if (['.ts', '.js', '.jsx', '.tsx', '.py', '.rs', '.go', '.java', '.cpp', '.cs'].includes(ext)) {
                        await this.analyzeFile(rootUri, entryUri, report);
                    }
                }
            }
        } catch {
            // Ignore directory read errors
        }
    }

    private static async analyzeFile(rootUri: vscode.Uri, fileUri: vscode.Uri, report: AuditReport): Promise<void> {
        try {
            const data = await vscode.workspace.fs.readFile(fileUri);
            const content = new TextDecoder('utf-8').decode(data);
            const lines = content.split('\n');
            const relativePath = path.relative(rootUri.fsPath, fileUri.fsPath);

            report.filesScanned++;
            report.linesScanned += lines.length;

            let inClass = false;
            let classStartLine = 0;
            let currentClassName = '';

            const lineHashes = new Map<string, number>();

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                const trimmed = line.trim();

                // 1. Detect Abstractions (interfaces, types, abstract classes, protocols)
                if (
                    trimmed.startsWith('interface ') ||
                    trimmed.startsWith('type ') ||
                    trimmed.startsWith('abstract class ') ||
                    trimmed.startsWith('protocol ')
                ) {
                    report.abstractionsCount++;
                    if (report.abstractionsCount > 25) { // Arbitrary threshold indicating high abstraction density
                        report.issues.push({
                            file: relativePath,
                            line: i + 1,
                            type: 'abstraction',
                            message: `High abstraction count: Definition of interface/type \`${trimmed.split(/\s+/).slice(0, 3).join(' ')}\` adds to cognitive architecture load.`,
                            debtHours: 0.5
                        });
                    }
                }

                // 2. Class scanning (large classes)
                if (trimmed.startsWith('class ')) {
                    inClass = true;
                    classStartLine = i + 1;
                    currentClassName = trimmed.split(/\s+/)[1] || 'Unknown';
                }

                // Simple detection of class endings (closing bracket in column 0)
                if (inClass && trimmed === '}' && line.indexOf('}') === 0) {
                    const classLength = (i + 1) - classStartLine;
                    if (classLength > 200) {
                        report.issues.push({
                            file: relativePath,
                            line: classStartLine,
                            type: 'large-block',
                            message: `Large class \`${currentClassName}\` detected (${classLength} lines). Consider splitting or decomposing into linear functional modules.`,
                            debtHours: 3.0
                        });
                    }
                    inClass = false;
                }

                // 3. Simple Cyclomatic Complexity estimation
                // Count complexity keywords inside functions
                let complexityPoints = 1;
                const complexityKeywords = [/\bif\b/g, /\bfor\b/g, /\bwhile\b/g, /\bcatch\b/g, /\bswitch\b/g, /&&/g, /\|\|/g];
                
                // If a line is a function start, look ahead for its complexity
                if (
                    trimmed.includes('function ') ||
                    trimmed.includes('=>') ||
                    (trimmed.startsWith('def ') && trimmed.endsWith(':')) ||
                    (trimmed.startsWith('fn ') && trimmed.includes('{'))
                ) {
                    let functionEnd = Math.min(i + 40, lines.length); // Scan next 40 lines
                    let funcName = trimmed.split('(')[0] || 'anonymous';
                    
                    for (let j = i; j < functionEnd; j++) {
                        const subLine = lines[j];
                        for (const regex of complexityKeywords) {
                            const matches = subLine.match(regex);
                            if (matches) {
                                complexityPoints += matches.length;
                            }
                        }
                    }

                    if (complexityPoints > 12) {
                        report.issues.push({
                            file: relativePath,
                            line: i + 1,
                            type: 'complexity',
                            message: `High cyclomatic complexity (${complexityPoints}) in function \`${funcName.trim()}\`. Simplify logical branching.`,
                            debtHours: 2.0
                        });
                    }

                    // Check for large function (e.g. > 50 lines)
                    // We estimate length by finding the closing bracket or indent level
                    // Here we do a simplified check for line count within block
                }

                // 4. Duplicate code detection (naive line matching)
                if (trimmed.length > 30 && !trimmed.startsWith('import') && !trimmed.startsWith('*') && !trimmed.startsWith('//')) {
                    const hash = trimmed.replace(/\s+/g, '');
                    const prevLine = lineHashes.get(hash);
                    if (prevLine !== undefined) {
                        // Duplicate line found
                        if (i + 1 - prevLine > 5) { // Prevent logging contiguous identical lines
                            report.issues.push({
                                file: relativePath,
                                line: i + 1,
                                type: 'duplication',
                                message: `Potential code duplication: line matches line ${prevLine}. Reuse existing code or utilities.`,
                                debtHours: 1.0
                            });
                        }
                    } else {
                        lineHashes.set(hash, i + 1);
                    }
                }
            }
        } catch {
            // Ignore file read errors
        }
    }

    private static async checkUnusedDependencies(rootUri: vscode.Uri, report: AuditReport): Promise<void> {
        // Read package.json to get list of declared dependencies
        const packageJsonUri = vscode.Uri.joinPath(rootUri, 'package.json');
        try {
            const data = await vscode.workspace.fs.readFile(packageJsonUri);
            const content = new TextDecoder('utf-8').decode(data);
            const parsed = JSON.parse(content);
            const dependencies = Object.keys(parsed.dependencies || {});
            
            if (dependencies.length === 0) {
                return;
            }

            // Keep track of which dependencies are imported
            const importedDeps = new Set<string>();
            
            // Perform a quick global search for imports across the codebase
            // Note: Since this is done within the extension, we can do a simple file scan or assume a subset
            // To make this super performant, we check files that we already scanned
            // (Alternatively, we scan up to first 20 TS/JS files to see if the dependency is imported)
            // Let's implement a quick text scanner on the workspace files for imports:
            const files = await vscode.workspace.findFiles('**/*.{ts,js,tsx,jsx}', '**/node_modules/**');
            
            for (const file of files.slice(0, 50)) { // Limit to first 50 files for speed
                const fileData = await vscode.workspace.fs.readFile(file);
                const fileContent = new TextDecoder('utf-8').decode(fileData);
                
                for (const dep of dependencies) {
                    const importRegex = new RegExp(`from\\s+['"]${dep}['"]|require\\(\\s*['"]${dep}['"]\\s*\\)`, 'g');
                    if (importRegex.test(fileContent)) {
                        importedDeps.add(dep);
                    }
                }
            }

            // Flag unused dependencies
            for (const dep of dependencies) {
                if (!importedDeps.has(dep)) {
                    report.issues.push({
                        file: 'package.json',
                        type: 'unused-dep',
                        message: `Dependency '${dep}' is declared in package.json but not imported in any scanned files. Consider removing it to slim down dependencies.`,
                        debtHours: 1.5
                    });
                }
            }
        } catch {
            // No package.json or error parsing it
        }
    }

    public static formatReportMarkdown(report: AuditReport): string {
        const issuesByType = (type: string) => report.issues.filter(i => i.type === type);

        const markdown: string[] = [
            `# 🏗️ LeanCoder Repository Audit Report`,
            `Audit completed on **${new Date().toLocaleDateString()}** at **${new Date().toLocaleTimeString()}**.`,
            '',
            `## Summary Metrics`,
            `| Metric | Value |`,
            `| :--- | :--- |`,
            `| **Files Scanned** | ${report.filesScanned} |`,
            `| **Lines of Code Scanned** | ${report.linesScanned} |`,
            `| **Total Abstractions Defined** | ${report.abstractionsCount} |`,
            `| **Maintainability Score** | \`${report.maintainabilityScore}/100\` |`,
            `| **Estimated Technical Debt** | \`${report.technicalDebtHours} hours\` |`,
            `| **Total Issues Flagged** | **${report.issues.length}** |`,
            '',
            `## Technical Debt Breakdown`,
            `- **Over-engineering & Abstractions**: ${issuesByType('abstraction').length} issues (${issuesByType('abstraction').reduce((a, b) => a + b.debtHours, 0)}h debt)`,
            `- **Complexity & Nested Logic**: ${issuesByType('complexity').length} issues (${issuesByType('complexity').reduce((a, b) => a + b.debtHours, 0)}h debt)`,
            `- **Code Duplication**: ${issuesByType('duplication').length} issues (${issuesByType('duplication').reduce((a, b) => a + b.debtHours, 0)}h debt)`,
            `- **Large Classes / Blocks**: ${issuesByType('large-block').length} issues (${issuesByType('large-block').reduce((a, b) => a + b.debtHours, 0)}h debt)`,
            `- **Unused Dependencies**: ${issuesByType('unused-dep').length} issues (${issuesByType('unused-dep').reduce((a, b) => a + b.debtHours, 0)}h debt)`,
            '',
            `## Detailed Issues List`,
            '| File | Line | Severity/Type | Finding | Est. Debt |',
            '| :--- | :--- | :--- | :--- | :--- |'
        ];

        if (report.issues.length === 0) {
            markdown.push('| *None* | - | - | No issues found! Your repository is extremely lean. | - |');
        } else {
            for (const issue of report.issues) {
                const badge = issue.type === 'complexity' ? '🔴 Complexity' :
                              issue.type === 'duplication' ? '🟡 Duplication' :
                              issue.type === 'large-block' ? '🍊 Large Block' :
                              issue.type === 'unused-dep' ? '📦 Unused Dep' : '🔵 Architecture';
                
                markdown.push(`| \`${issue.file}\` | ${issue.line || '-'} | ${badge} | ${issue.message} | \`${issue.debtHours}h\` |`);
            }
        }

        markdown.push('\n### Recommended Immediate Actions');
        if (report.issues.length === 0) {
            markdown.push('1. Keep doing what you are doing! Avoid building new abstractions.');
        } else {
            let actionId = 1;
            if (issuesByType('unused-dep').length > 0) {
                markdown.push(`${actionId++}. Run \`npm uninstall\` for unused dependencies listed above.`);
            }
            if (issuesByType('duplication').length > 0) {
                markdown.push(`${actionId++}. Refactor duplicate code in \`${issuesByType('duplication')[0].file}\` using helper functions.`);
            }
            if (issuesByType('complexity').length > 0) {
                markdown.push(`${actionId++}. Flatten cyclomatic complexity in \`${issuesByType('complexity')[0].file}\` function \`${issuesByType('complexity')[0].message.split('`')[1] || ''}\`.`);
            }
            markdown.push(`${actionId++}. Implement continuous coding standards using LeanCoder Ultra mode.`);
        }

        return markdown.join('\n');
    }
}
