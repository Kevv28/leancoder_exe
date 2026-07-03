# 🧘 LeanCoder VS Code Extension

LeanCoder is a **production-ready coding philosophy layer** that acts as an invisible filter between you, your project context, and the AI models you use in VS Code. It automatically intercepts chat requests, reviews active files, and optimizes generated diffs to enforce a strict minimalist philosophy.

LeanCoder helps you keep code bases clean, fast, and easy to maintain by prioritizing code deletions, enforcing YAGNI/KISS, preferring native standard library features, and preventing premature architectural over-engineering.

---

## 🌟 Core Features

- **Prompt Interception & Workspace Scanning**: Merges workspace context files (`README.md`, `CLAUDE.md`, `AGENTS.md`, `.cursorrules`, `.vscode/settings.json`) into one optimized prompt.
- **Rules Engine (Lite, Full, Ultra)**: Auto-injects coding guidelines based on your desired level of strictness.
- **Prompt Optimizer**: Deduplicates rules and compresses prompts to save API tokens.
- **Diff Analyzer**: Reviews model-generated code in real-time, checking for redundant dependencies, unnecessary helpers, or nested logic.
- **Repository Audit Engine**: Scans your entire codebase to report abstractions density, cyclomatic complexity, dead code, and technical debt hours.
- **Benchmark Engine**: Tracks LOC impact (+/- lines), dependency growth, and cumulative prompt token/cost savings per session.

---

## 🎚️ Operating Modes

1. **Lite Mode**: Subtle suggestions, minimal intervention. Fits seamlessly into standard developer prompts.
2. **Full Mode (Default)**: Normal YAGNI, standard library focus, early returns, clean layout constraints.
3. **Ultra Mode (Aggressive)**: Heavy focus on code deletions, flattens nesting, challenges every single function/class structure.

---

## 🛠️ Commands

You can trigger LeanCoder using commands in the VS Code Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) or inside `@leancoder` chat participant subcommands:

| Command | Action | Description |
| :--- | :--- | :--- |
| `/leancoder lite` | `leancoder.lite` | Switch LeanCoder to Lite Mode. |
| `/leancoder full` | `leancoder.full` | Switch LeanCoder to Full Mode. |
| `/leancoder ultra` | `leancoder.ultra` | Switch LeanCoder to Ultra Mode. |
| `/leancoder audit` | `leancoder.audit` | Scans workspace and compiles technical debt report. |
| `/leancoder benchmark` | `leancoder.benchmark` | Generates a benchmark report of lines, stdlib, cost savings. |
| `/leancoder review` | `leancoder.review` | Performs a static and AI review of the active file. |
| `/leancoder simplify` | `leancoder.simplify` | AI refactoring of the selected code to minimize lines/abstractions. |
| `/leancoder optimize` | `leancoder.optimize` | AI refactoring of selection to optimize speed/memory under KISS/YAGNI. |
| `/leancoder explain` | `leancoder.explain` | Opens the coding philosophy documentation sheet. |

---

## ⚙️ Configuration Settings

Customize LeanCoder settings in your `.vscode/settings.json`:

```json
{
  "leancoder.mode": "full",
  "leancoder.autoInject": true,
  "leancoder.optimizePrompt": true,
  "leancoder.scanWorkspace": true,
  "leancoder.analyzeDiff": true,
  "leancoder.reuseExisting": true,
  "leancoder.preferStdlib": true,
  "leancoder.preferNative": true,
  "leancoder.preferDeletion": true
}
```

---

## 📦 Building and Packaging

### Prerequisites
- Node.js `v20+`
- npm `v10+`

### Installation
Clone or move the project folder, then run:
```bash
npm install
```

### Compiling Code
Compile TypeScript files:
```bash
npm run compile
```

### Run Tests
Execute mocha integration test suite in a clean VS Code environment:
```bash
npm test
```

### Build VSIX Package
Package the extension for local installation or marketplace upload:
```bash
npx vsce package
```
This produces `leancoder-1.0.0.vsix` in the workspace root.

---

## 📝 License
This extension is licensed under the [MIT License](LICENSE).
