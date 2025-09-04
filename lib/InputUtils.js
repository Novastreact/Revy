/**
 * InputUtils.js
 * Enhanced input utilities with single-key support
 */

const readline = require('readline');

class InputUtils {
    constructor() {
        this.rl = null;
    }

    /**
     * Get single key input without pressing Enter
     */
    async getSingleKey(prompt = '') {
        if (prompt) {
            process.stdout.write(prompt);
        }

        return new Promise((resolve) => {
            // Set raw mode for single key capture
            if (process.stdin.isTTY) {
                process.stdin.setRawMode(true);
            }
            
            process.stdin.resume();
            process.stdin.setEncoding('utf8');

            const onData = (key) => {
                // Clean up listener
                process.stdin.removeListener('data', onData);
                
                // Reset terminal mode
                if (process.stdin.isTTY) {
                    process.stdin.setRawMode(false);
                }
                process.stdin.pause();

                // Handle Ctrl+C
                if (key === '\u0003') {
                    process.exit(0);
                }

                // Echo the key if it's printable
                if (key >= ' ' && key <= '~') {
                    process.stdout.write(key + '\n');
                } else if (key === '\r' || key === '\n') {
                    process.stdout.write('\n');
                }

                resolve(key.trim());
            };

            process.stdin.on('data', onData);
        });
    }

    /**
     * Wait for any key press
     */
    async waitForKey(prompt = 'Press any key to continue...') {
        await this.getSingleKey(prompt);
    }

    /**
     * Regular question with Enter required
     */
    async question(prompt) {
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
    }

    /**
     * Multi-line input with terminator
     */
    async multiLineInput(prompt = 'Enter text:', terminator = '\\end') {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
            terminal: true
        });

        console.log(`${prompt} (type "${terminator}" on a new line to finish)`);
        
        const lines = [];
        
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

    /**
     * Y/N confirmation with single key
     */
    async confirmYN(prompt, defaultAnswer = 'n') {
        const key = await this.getSingleKey(`${prompt} `);
        const answer = key.toLowerCase();
        
        if (answer === 'y') {
            return true;
        } else if (answer === 'n' || answer === '' || key === '\r' || key === '\n') {
            return defaultAnswer.toLowerCase() === 'y';
        }
        
        // For any other key, assume default
        return defaultAnswer.toLowerCase() === 'y';
    }

    /**
     * Select from numbered options with single key
     */
    async selectOption(prompt, options, cancelOption = '0') {
        console.log(prompt);
        
        options.forEach((option, index) => {
            console.log(`  ${index + 1}. ${option}`);
        });
        
        if (cancelOption) {
            console.log(`  ${cancelOption}. Cancel`);
        }
        
        const key = await this.getSingleKey('\nSelect option: ');
        const choice = parseInt(key);
        
        if (key === cancelOption) {
            return -1; // Cancel
        }
        
        if (choice >= 1 && choice <= options.length) {
            return choice - 1; // Return 0-based index
        }
        
        return -1; // Invalid choice
    }

    /**
     * Menu navigation with arrow keys (fallback to numbers)
     */
    async navigateMenu(title, options) {
        console.log(`\n${title}\n`);
        
        options.forEach((option, index) => {
            console.log(`  ${index + 1}. ${option}`);
        });
        
        console.log('\nPress 1-9 to select:');
        
        const key = await this.getSingleKey();
        const choice = parseInt(key);
        
        if (choice >= 1 && choice <= options.length && choice <= 9) {
            return choice - 1; // Return 0-based index
        }
        
        return -1; // Invalid choice
    }

    /**
     * Progress confirmation with single key
     */
    async confirmProgress(message, destructive = false) {
        if (destructive) {
            console.log(`\n⚠️  ${message}`);
            const key = await this.getSingleKey('Type "y" to confirm destructive operation: ');
            return key.toLowerCase() === 'y';
        } else {
            const key = await this.getSingleKey(`${message} (y/N): `);
            return key.toLowerCase() === 'y';
        }
    }

    /**
     * Smart input - detects if single key or full input needed
     */
    async smartInput(prompt, singleKeyOptions = ['y', 'n']) {
        // Check if this looks like a single key prompt
        const lowerPrompt = prompt.toLowerCase();
        const isSingleKey = singleKeyOptions.some(option => 
            lowerPrompt.includes(`(${option}`) || 
            lowerPrompt.includes(`[${option}`) ||
            lowerPrompt.includes(`/${option}`)
        );

        if (isSingleKey) {
            return await this.getSingleKey(prompt);
        } else {
            return await this.question(prompt);
        }
    }
}

// Export singleton instance
module.exports = new InputUtils();