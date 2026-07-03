import * as path from 'path';
import * as fs from 'fs';
import Mocha from 'mocha';

export function run(): Promise<void> {
    const mocha = new Mocha({
        ui: 'tdd',
        color: true,
        timeout: 10000
    });

    const testsRoot = path.resolve(__dirname, '.');

    return new Promise((resolve, reject) => {
        try {
            // Find all files ending in .test.js recursively using native Node fs
            const files = fs.readdirSync(testsRoot, { recursive: true }) as string[];
            const testFiles = files.filter(f => f.endsWith('.test.js'));

            testFiles.forEach(file => {
                mocha.addFile(path.resolve(testsRoot, file));
            });

            mocha.run(failures => {
                if (failures > 0) {
                    reject(new Error(`${failures} tests failed.`));
                } else {
                    resolve();
                }
            });
        } catch (err) {
            console.error('Failed to run test suite:', err);
            reject(err);
        }
    });
}
