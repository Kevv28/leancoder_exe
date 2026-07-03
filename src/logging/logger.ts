import * as vscode from 'vscode';

export class Logger {
    private static channel: vscode.OutputChannel | undefined;

    public static initialize(): void {
        if (!this.channel) {
            this.channel = vscode.window.createOutputChannel('LeanCoder');
        }
    }

    public static info(message: string): void {
        this.log('INFO', message);
    }

    public static warn(message: string): void {
        this.log('WARN', message);
    }

    public static error(message: string | Error): void {
        if (message instanceof Error) {
            this.log('ERROR', `${message.message}\nStack:\n${message.stack}`);
        } else {
            this.log('ERROR', message);
        }
    }

    public static debug(message: string): void {
        this.log('DEBUG', message);
    }

    private static log(level: string, message: string): void {
        const timestamp = new Date().toISOString();
        const formatted = `[${timestamp}] [${level}] ${message}`;
        
        // Write to VS Code output channel
        if (this.channel) {
            this.channel.appendLine(formatted);
        }
        
        // Also print to extension developer console
        console.log(formatted);
    }

    public static show(): void {
        if (this.channel) {
            this.channel.show(true);
        }
    }
}
