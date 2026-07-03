import * as vscode from 'vscode';
import * as path from 'path';

export interface ActiveFileContext {
    fileName: string;
    relativePath: string;
    languageId: string;
    content: string;
    selection?: string;
    selectionStartLine?: number;
    selectionEndLine?: number;
}

export interface WorkspaceContext {
    readme?: string;
    agents?: string;
    claude?: string;
    contributing?: string;
    styleguide?: string;
    customInstructions?: string; // .cursorrules, copilot-instructions.md, etc.
    workspaceSettings?: string;
    projectTypes: string[];
    dependencies: string[];
    activeFile?: ActiveFileContext;
}

export class WorkspaceScanner {
    private static MAX_READ_BYTES = 12000; // Limit read to ~12KB per file to prevent token bloat

    public static async scan(): Promise<WorkspaceContext> {
        const context: WorkspaceContext = {
            projectTypes: [],
            dependencies: []
        };

        const folders = vscode.workspace.workspaceFolders;
        if (!folders || folders.length === 0) {
            this.scanActiveFile(context);
            return context;
        }

        const rootUri = folders[0].uri;

        // 1. Scan documentation files
        context.readme = await this.readWorkspaceFile(rootUri, 'README.md');
        context.agents = await this.readWorkspaceFile(rootUri, 'AGENTS.md');
        context.claude = await this.readWorkspaceFile(rootUri, 'CLAUDE.md');
        context.contributing = await this.readWorkspaceFile(rootUri, 'CONTRIBUTING.md');
        context.styleguide = await this.readWorkspaceFile(rootUri, 'STYLEGUIDE.md');

        // 2. Scan custom instructions
        const copilotInstructions = await this.readWorkspaceFile(rootUri, '.github/copilot-instructions.md');
        const cursorrules = await this.readWorkspaceFile(rootUri, '.cursorrules');
        const cursorRulesFolder = await this.readCursorRulesFolder(rootUri);
        
        const customInstructionsParts: string[] = [];
        if (copilotInstructions) {customInstructionsParts.push(`[Copilot Instructions]:\n${copilotInstructions}`);}
        if (cursorrules) {customInstructionsParts.push(`[.cursorrules]:\n${cursorrules}`);}
        if (cursorRulesFolder) {customInstructionsParts.push(`[Cursor Rules]:\n${cursorRulesFolder}`);}
        
        if (customInstructionsParts.length > 0) {
            context.customInstructions = customInstructionsParts.join('\n\n');
        }

        // 3. Scan workspace settings (.vscode/settings.json)
        const vscodeSettings = await this.readWorkspaceFile(rootUri, '.vscode/settings.json');
        if (vscodeSettings) {
            context.workspaceSettings = vscodeSettings;
        }

        // 4. Scan package/dependency manifests to identify project type and dependencies
        await this.scanProjectManifests(rootUri, context);

        // 5. Scan active editor
        this.scanActiveFile(context);

        return context;
    }

    private static async readWorkspaceFile(rootUri: vscode.Uri, relativePath: string): Promise<string | undefined> {
        const fileUri = vscode.Uri.joinPath(rootUri, relativePath);
        try {
            const stat = await vscode.workspace.fs.stat(fileUri);
            if (stat.type !== vscode.FileType.File) {
                return undefined;
            }
            const data = await vscode.workspace.fs.readFile(fileUri);
            
            // Decoded content up to max read length
            const text = new TextDecoder('utf-8').decode(data);
            if (text.length > this.MAX_READ_BYTES) {
                return text.substring(0, this.MAX_READ_BYTES) + '\n\n[... content truncated by LeanCoder for size limit ...]';
            }
            return text;
        } catch {
            return undefined; // File doesn't exist or is not readable
        }
    }

    private static async readCursorRulesFolder(rootUri: vscode.Uri): Promise<string | undefined> {
        const folderUri = vscode.Uri.joinPath(rootUri, '.cursor', 'rules');
        try {
            const entries = await vscode.workspace.fs.readDirectory(folderUri);
            const rules: string[] = [];
            for (const [name, type] of entries) {
                if (type === vscode.FileType.File && (name.endsWith('.md') || name.endsWith('.txt') || name.endsWith('.json'))) {
                    const content = await this.readWorkspaceFile(rootUri, `.cursor/rules/${name}`);
                    if (content) {
                        rules.push(`Rule file '${name}':\n${content}`);
                    }
                }
            }
            return rules.length > 0 ? rules.join('\n\n') : undefined;
        } catch {
            return undefined;
        }
    }

    private static async scanProjectManifests(rootUri: vscode.Uri, context: WorkspaceContext): Promise<void> {
        // Node.js (package.json)
        const packageJson = await this.readWorkspaceFile(rootUri, 'package.json');
        if (packageJson) {
            context.projectTypes.push('node');
            try {
                const parsed = JSON.parse(packageJson);
                const deps = [
                    ...Object.keys(parsed.dependencies || {}),
                    ...Object.keys(parsed.devDependencies || {})
                ];
                context.dependencies.push(...deps);
            } catch {
                // Ignore parse errors
            }
        }

        // Python (requirements.txt, pyproject.toml)
        const pyproject = await this.readWorkspaceFile(rootUri, 'pyproject.toml');
        const requirements = await this.readWorkspaceFile(rootUri, 'requirements.txt');
        if (pyproject || requirements) {
            context.projectTypes.push('python');
            if (requirements) {
                const deps = requirements.split('\n')
                    .map(line => line.trim())
                    .filter(line => line && !line.startsWith('#'))
                    .map(line => line.split(/[==,>=,<=,>,<, ]/)[0]);
                context.dependencies.push(...deps);
            }
            if (pyproject) {
                // Simple regex parser for dependencies in pyproject.toml
                const matches = pyproject.matchAll(/dependencies\s*=\s*\[([\s\S]*?)\]/g);
                for (const match of matches) {
                    const depsList = match[1].split(',')
                        .map(d => d.trim().replace(/['"]/g, ''))
                        .filter(d => d);
                    context.dependencies.push(...depsList);
                }
            }
        }

        // Rust (Cargo.toml)
        const cargo = await this.readWorkspaceFile(rootUri, 'Cargo.toml');
        if (cargo) {
            context.projectTypes.push('rust');
            const lines = cargo.split('\n');
            let inDependencies = false;
            for (const line of lines) {
                const trimmed = line.trim();
                if (trimmed.startsWith('[dependencies]') || trimmed.startsWith('[dev-dependencies]')) {
                    inDependencies = true;
                    continue;
                }
                if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
                    inDependencies = false;
                }
                if (inDependencies && trimmed && !trimmed.startsWith('#')) {
                    const parts = trimmed.split('=');
                    if (parts.length > 0) {
                        context.dependencies.push(parts[0].trim());
                    }
                }
            }
        }

        // Go (go.mod)
        const goMod = await this.readWorkspaceFile(rootUri, 'go.mod');
        if (goMod) {
            context.projectTypes.push('go');
            const matches = goMod.matchAll(/require\s+\(?([\s\S]*?)\)?/g);
            for (const match of matches) {
                const deps = match[1].split('\n')
                    .map(line => line.trim())
                    .filter(line => line && !line.startsWith('//'))
                    .map(line => line.split(/\s+/)[0]);
                context.dependencies.push(...deps);
            }
        }
    }

    private static scanActiveFile(context: WorkspaceContext): void {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {return;}

        const document = editor.document;
        const selection = editor.selection;
        let selectedText: string | undefined;

        if (selection && !selection.isEmpty) {
            selectedText = document.getText(selection);
        }

        let relativePath = document.fileName;
        const folders = vscode.workspace.workspaceFolders;
        if (folders && folders.length > 0) {
            relativePath = path.relative(folders[0].uri.fsPath, document.fileName);
        }

        // Limit the active file size read to avoid token overflow
        const fullContent = document.getText();
        const content = fullContent.length > this.MAX_READ_BYTES 
            ? fullContent.substring(0, this.MAX_READ_BYTES) + '\n\n[... active file truncated by LeanCoder for size limit ...]'
            : fullContent;

        context.activeFile = {
            fileName: path.basename(document.fileName),
            relativePath,
            languageId: document.languageId,
            content,
            selection: selectedText,
            selectionStartLine: selection ? selection.start.line + 1 : undefined,
            selectionEndLine: selection ? selection.end.line + 1 : undefined
        };
    }
}
