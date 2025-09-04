/**
 * DespendentionImport.js
 * Centralized dependency loader for Revy with InputUtils support
 */

const path = require('path');
const os = require('os');

// Dynamic paths
const HOME = os.homedir();
const REVY_HOME = process.env.REVY_HOME || path.join(HOME, '.revy');
const REVY_DEPS = process.env.REVY_DEPS || path.join(REVY_HOME, 'deps', 'node_modules');
const REVY_LIB = process.env.REVY_LIB || path.join(REVY_HOME, 'lib');

// Core Node.js modules
const fs = require('fs');
const util = require('util');
const { spawn, exec } = require('child_process');
const execAsync = util.promisify(exec);

// Try to load external dependencies from local deps
let chalk, ora, cliProgress;

try {
    chalk = require(path.join(REVY_DEPS, 'chalk'));
} catch {
    // Fallback to basic coloring
    chalk = {
        red: (text) => `\x1b[31m${text}\x1b[0m`,
        green: (text) => `\x1b[32m${text}\x1b[0m`,
        yellow: (text) => `\x1b[33m${text}\x1b[0m`,
        blue: (text) => `\x1b[34m${text}\x1b[0m`,
        cyan: (text) => `\x1b[36m${text}\x1b[0m`,
        white: (text) => `\x1b[37m${text}\x1b[0m`,
        gray: (text) => `\x1b[90m${text}\x1b[0m`,
        grey: (text) => `\x1b[90m${text}\x1b[0m`,
        bold: (text) => `\x1b[1m${text}\x1b[0m`,
        dim: (text) => `\x1b[2m${text}\x1b[0m`
    };
}

try {
    ora = require(path.join(REVY_DEPS, 'ora'));
} catch {
    // Fallback spinner
    ora = (text) => ({
        start: () => {
            process.stdout.write(`${text}...`);
            return {
                stop: () => process.stdout.write(' done\n'),
                succeed: (msg) => process.stdout.write(` ${msg || 'done'}\n`),
                fail: (msg) => process.stdout.write(` ${msg || 'failed'}\n`),
                text: text
            };
        }
    });
}

try {
    cliProgress = require(path.join(REVY_DEPS, 'cli-progress'));
} catch {
    // Fallback progress bar
    cliProgress = {
        SingleBar: class {
            constructor(options) {
                this.options = options;
                this.total = 0;
                this.current = 0;
                this.lastPercent = -1;
            }
            start(total, startValue, payload) {
                this.total = total;
                this.current = startValue || 0;
                this.payload = payload || {};
            }
            update(value, payload) {
                this.current = value;
                this.payload = { ...this.payload, ...payload };
                const percent = Math.floor((value / this.total) * 100);
                if (percent !== this.lastPercent && percent % 10 === 0) {
                    process.stdout.write(`\rProgress: ${percent}% ${this.payload.speed || ''} ${this.payload.filesProgress || ''}`);
                    this.lastPercent = percent;
                }
            }
            stop() {
                process.stdout.write('\n');
            }
        }
    };
}

// Load internal utilities
let inputUtils, fsUtils, progressUtils, hashUtils;

try {
    inputUtils = require(path.join(REVY_LIB, 'InputUtils.js'));
} catch (error) {
    console.warn('Warning: InputUtils not found, creating fallback');
    inputUtils = {
        getSingleKey: async (prompt) => {
            process.stdout.write(prompt);
            return new Promise((resolve) => {
                process.stdin.once('data', (key) => {
                    resolve(key.toString().trim());
                });
            });
        },
        waitForKey: async (prompt) => {
            await inputUtils.getSingleKey(prompt);
        },
        question: async (prompt) => {
            const readline = require('readline');
            const rl = readline.createInterface({
                input: process.stdin,
                output: process.stdout
            });
            return new Promise((resolve) => {
                rl.question(prompt, (answer) => {
                    rl.close();
                    resolve(answer);
                });
            });
        },
        multiLineInput: async (prompt, terminator) => {
            console.log(`${prompt} (type "${terminator}" to finish)`);
            const lines = [];
            const readline = require('readline');
            const rl = readline.createInterface({
                input: process.stdin,
                output: process.stdout
            });
            
            return new Promise((resolve) => {
                const processLine = () => {
                    rl.question('> ', (answer) => {
                        if (answer.trim() === terminator) {
                            rl.close();
                            resolve(lines.join('\n'));
                        } else {
                            lines.push(answer);
                            processLine();
                        }
                    });
                };
                processLine();
            });
        }
    };
}

// File system utilities
fsUtils = {
    // Ensure directory exists
    async ensureDir(dirPath) {
        try {
            await fs.promises.mkdir(dirPath, { recursive: true });
        } catch (error) {
            if (error.code !== 'EEXIST') throw error;
        }
    },

    // Copy file with metadata preservation
    async copyFile(src, dest) {
        try {
            await fs.promises.copyFile(src, dest);
            const stats = await fs.promises.stat(src);
            await fs.promises.utimes(dest, stats.atime, stats.mtime);
        } catch (error) {
            throw new Error(`Failed to copy ${src} to ${dest}: ${error.message}`);
        }
    },

    // Get directory size recursively
    async getDirectorySize(dirPath) {
        let totalSize = 0;
        let fileCount = 0;
        let folderCount = 0;

        const processPath = async (currentPath) => {
            try {
                const stats = await fs.promises.stat(currentPath);
                
                if (stats.isDirectory()) {
                    folderCount++;
                    const items = await fs.promises.readdir(currentPath);
                    for (const item of items) {
                        await processPath(path.join(currentPath, item));
                    }
                } else {
                    fileCount++;
                    totalSize += stats.size;
                }
            } catch (error) {
                // Skip inaccessible files/directories
            }
        };

        await processPath(dirPath);
        return { totalSize, fileCount, folderCount };
    },

    // Format bytes for display
    formatBytes(bytes, decimals = 1) {
        if (bytes === 0) return '0 Bytes';
        
        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        
        return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
    },

    // Check if path exists
    async pathExists(filePath) {
        try {
            await fs.promises.access(filePath);
            return true;
        } catch {
            return false;
        }
    }
};

// Progress utilities
progressUtils = {
    // Create simple progress indicator
    createProgress(total) {
        let current = 0;
        return {
            update: (value) => {
                current = value;
                const percent = Math.round((current / total) * 100);
                process.stdout.write(`\rProgress: ${percent}%`);
            },
            complete: () => {
                process.stdout.write('\n');
            }
        };
    }
};

// Hash utilities for file verification
hashUtils = {
    // Simple file hash (placeholder)
    async hashFile(filePath) {
        const crypto = require('crypto');
        const hash = crypto.createHash('md5');
        
        return new Promise((resolve, reject) => {
            const stream = fs.createReadStream(filePath);
            stream.on('data', (data) => hash.update(data));
            stream.on('end', () => resolve(hash.digest('hex')));
            stream.on('error', reject);
        });
    }
};

// Export all dependencies
module.exports = {
    // Core Node.js
    fs,
    path,
    execAsync,
    spawn,
    exec,
    util,
    
    // External dependencies (with fallbacks)
    chalk,
    ora,
    cliProgress,
    
    // Internal utilities
    inputUtils,
    fsUtils,
    progressUtils,
    hashUtils,
    
    // Constants
    HOME,
    REVY_HOME,
    REVY_DEPS,
    REVY_LIB
};