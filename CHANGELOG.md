# Changelog

All notable changes to the **LeanCoder** extension will be documented in this file.

## [1.0.0] - 2026-07-03

### Initial Production Release
- **Chat Participant Integration**: Implemented `@leancoder` chat participant with subcommands (`lite`, `full`, `ultra`, `review`, `audit`, `simplify`, `optimize`, `benchmark`, `explain`).
- **Workspace Scanner**: Added dynamic scanning of `README.md`, `CLAUDE.md`, `AGENTS.md`, `.cursorrules`, and `.vscode/settings.json`.
- **Rule Engine & Prompt Optimizer**: Implemented Lite, Full, and Ultra modes. Automatically deduplicates prompt directives and compresses text.
- **Diff Analyzer**: Real-time evaluation of generated code blocks to flag non-stdlib dependencies, deep nesting, and redundant logic.
- **Repository Audit Engine**: Scans workspace for cyclomatic complexity, abstractions density, large functions/classes, duplicate lines, and technical debt.
- **Benchmark Engine**: Tracks LOC deltas, dependency growth, and cumulative prompt token/cost savings per session.
- **Palette Commands**: Implemented palette shortcuts and inline code mutation for simplification and optimization.
- **Status Bar Integration**: Visual status bar toggle for current LeanCoder mode with QuickPick support.
