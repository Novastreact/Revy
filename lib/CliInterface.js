/**
 * CliInterface.js - Updated Version
 * Command Line Interface for Revy
 * Changes: Y/N confirmation, single key navigation, version display, 24h format
 */

const os = require('os');
const path = require('path');
const HOME = os.homedir();

// Dynamic path resolution for user-space
const REVY_HOME = process.env.REVY_HOME || path.join(HOME, '.revy');
const REVY_CONFIG = process.env.REVY_CONFIG || path.join(REVY_HOME, 'config');
const REVY_DATA = process.env.REVY_DATA || path.join(HOME, '.local', 'share', 'revy');
const REVY_LIB = process.env.REVY_LIB || path.join(REVY_HOME, 'lib');

// Import modules with proper error handling
let DespendentionImport, ConfigManager, RevyCore;
let fs, chalk, ora, inputUtils, fsUtils, execAsync;

try {
    DespendentionImport = require(path.join(REVY_LIB, 'DespendentionImport.js'));
    ConfigManager = require(path.join(REVY_LIB, 'ConfigManager.js'));
    RevyCore = require(path.join(REVY_LIB, 'RevyCore.js'));
    
    ({ fs, chalk, ora, inputUtils, fsUtils, execAsync } = DespendentionImport);
} catch (error) {
    console.error('⚠ Failed to load required modules:', error.message);
    console.error('Please ensure revy is properly installed in ~/.revy/');
    process.exit(1);
}

class CliInterface {
    constructor() {
        this.isRunning = false;
        this.initialized = false;
    }

    /**
     * Initialize the interface with proper error handling
     */
    async initialize() {
        if (this.initialized) return true;
        
        try {
            // Ensure all required directories exist
            await this.ensureUserDirectories();
            
            // Test that ConfigManager is working
            await ConfigManager.init();
            
            this.initialized = true;
            return true;
        } catch (error) {
            console.error(chalk.red('⚠ Initialization failed:'), error.message);
            return false;
        }
    }

    /**
     * Ensure user directories exist without sudo
     */
    async ensureUserDirectories() {
        const dirs = [REVY_HOME, REVY_CONFIG, REVY_DATA];
        
        for (const dir of dirs) {
            try {
                await fs.promises.mkdir(dir, { recursive: true });
            } catch (error) {
                if (error.code !== 'EEXIST') {
                    throw new Error(`Cannot create directory ${dir}: ${error.message}`);
                }
            }
        }
    }

    /**
     * Helper: print notes with consistent formatting
     */
    _printNotes(notes, indent = '    ', labelColor = chalk.yellow) {
        if (!notes || notes === 'Null') {
            console.log(`${indent}Notes: ${chalk.gray('Null')}`);
            return;
        }

        const lines = notes.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
        if (lines.length === 0) {
            console.log(`${indent}Notes: ${chalk.gray('Null')}`);
            return;
        }

        console.log(`${indent}${labelColor('Notes:')}`);
        const dash = '-'.repeat(5) + ' ';
        console.log(`${indent}${dash}${chalk.gray(lines[0])}`);
        for (let i = 1; i < lines.length; i++) {
            console.log(`${indent}${chalk.gray(lines[i])}`);
        }
    }

    /**
     * Show main menu - exactly 3 options as requested
     */
    async showMainMenu() {
        // Initialize first
        const initSuccess = await this.initialize();
        if (!initSuccess) {
            console.log(chalk.red('Failed to initialize. Please check your installation.'));
            process.exit(1);
        }

        this.isRunning = true;
        
        while (this.isRunning) {
            console.clear();
            console.log(chalk.cyan.bold('\n📄 Revy - Save & Recovery Tool\n'));
            console.log(chalk.white('Choose an option:'));
            console.log(chalk.green('  1. Save'));
            console.log(chalk.blue('  2. Recovery'));
            console.log(chalk.gray('  3. Exit'));
            console.log(chalk.gray('\nPress a key (1-3):'));

            const key = await inputUtils.getSingleKey();
            const choice = key.trim();

            switch (choice) {
                case '1':
                    await this.handleSave();
                    break;
                case '2':
                    await this.handleRecovery();
                    break;
                case '3':
                case 'q':
                case 'Q':
                    this.isRunning = false;
                    console.log(chalk.yellow('\nGoodbye! 👋'));
                    process.exit(0);
                    break;
                default:
                    console.log(chalk.red('\nInvalid option. Press any key to continue...'));
                    await inputUtils.waitForKey('\nPress any key to return to menu...');
                    break;
            }
        }
    }

    /**
     * Handle save operation with improved path validation
     */
    async handleSave() {
        try {
            console.clear();
            console.log(chalk.green.bold('\n💾 Save Operation\n'));

            // Get source path
            const defaultSource = ConfigManager.get('save', 'source', path.join(HOME, 'Projects'));
            console.log(`Default source: ${chalk.gray(defaultSource)}`);
            const sourcePath = await inputUtils.question(`Enter source path (or press Enter for default): `);
            const finalSourcePath = sourcePath.trim() || defaultSource;

            // Validate source exists and is readable
            try {
                const stats = await fs.promises.stat(finalSourcePath);
                if (!stats.isDirectory()) {
                    throw new Error('Source must be a directory');
                }
                // Test read access
                await fs.promises.access(finalSourcePath, fs.constants.R_OK);
            } catch (error) {
                console.log(chalk.red(`⚠ Source path error: ${error.message}`));
                if (error.code === 'EACCES') {
                    console.log(chalk.yellow('Hint: Make sure you have read permission to this directory'));
                }
                await inputUtils.waitForKey('\nPress any key to return to menu...');
                return;
            }

            // Get destination path
            const defaultDest = ConfigManager.get('save', 'destination', path.join(HOME, 'Backups'));
            console.log(`\nDefault destination: ${chalk.gray(defaultDest)}`);
            const destPath = await inputUtils.question(`Enter destination path (or press Enter for default): `);
            const finalDestPath = destPath.trim() || defaultDest;

            // Validate destination is writable (create if needed)
            try {
                await fs.promises.mkdir(finalDestPath, { recursive: true });
                await fs.promises.access(finalDestPath, fs.constants.W_OK);
            } catch (error) {
                console.log(chalk.red(`⚠ Destination path error: Cannot write to ${finalDestPath}`));
                if (error.code === 'EACCES') {
                    console.log(chalk.yellow('Hint: Make sure you have write permission to this directory'));
                }
                await inputUtils.waitForKey('\nPress any key to return to menu...');
                return;
            }

            // Show pre-save summary
            console.log(chalk.cyan('\n📋 Pre-Save Summary:'));
            console.log(`   Source: ${chalk.bold(finalSourcePath)}`);
            console.log(`   Destination: ${chalk.bold(finalDestPath)}`);

            // Calculate and show estimated size
            const spinner = ora('Calculating size...').start();
            try {
                const stats = await fsUtils.getDirectorySize(finalSourcePath);
                const excludePatterns = ConfigManager.getArray('save', 'excluded', ',', []);
                
                spinner.stop();
                
                console.log(`   Estimated size: ${chalk.blue(fsUtils.formatBytes(stats.totalSize))}`);
                console.log(`   Files: ${chalk.blue(stats.fileCount.toLocaleString())}`);
                console.log(`   Folders: ${chalk.blue(stats.folderCount.toLocaleString())}`);
                console.log(`   Excluded patterns: ${chalk.gray(excludePatterns.join(', ') || 'none')}`);
            } catch (error) {
                spinner.stop();
                console.log(chalk.yellow(`   Warning: Could not calculate size: ${error.message}`));
            }

            // Get user notes
            console.log(chalk.yellow('\n User Notes (optional):'));
            let userNotes = await inputUtils.multiLineInput('Enter your notes:', '\\end');

            // Clean up the notes input
            userNotes = userNotes ? userNotes.trim() : '';
            if (!userNotes) {
                userNotes = 'Null';
            } else {
                const lines = userNotes.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
                if (lines.length === 0) {
                    userNotes = 'Null';
                } else {
                    const deduped = [];
                    for (const line of lines) {
                        if (deduped.length === 0 || deduped[deduped.length - 1] !== line) {
                            deduped.push(line);
                        }
                    }
                    userNotes = deduped.join('\n');
                }
            }

            // Final confirmation
            console.log(chalk.cyan('\n📋 Final Summary:'));
            console.log(`   Source: ${chalk.bold(finalSourcePath)}`);
            console.log(`   Destination: ${chalk.bold(finalDestPath)}`);
            this._printNotes(userNotes, '   ');

            const confirm = await inputUtils.getSingleKey(chalk.yellow('\nProceed with save operation? (y/N): '));
            
            if (confirm.toLowerCase() === 'y') {
                const excludePatterns = ConfigManager.getArray('save', 'excluded', ',', []);
                
                console.log(chalk.green('\n🚀 Starting save operation...\n'));
                
                const result = await RevyCore.save(finalSourcePath, finalDestPath, userNotes, excludePatterns);
                
                console.log(chalk.green('\n Save operation completed successfully!'));
                await inputUtils.waitForKey('\nPress any key to return to menu...');
            } else {
                console.log(chalk.yellow('\n⚠ Save operation cancelled.'));
                await inputUtils.waitForKey('\nPress any key to return to menu...');
            }

        } catch (error) {
            console.log(chalk.red(`\n⚠ Save failed: ${error.message}`));
            if (error.code === 'EACCES') {
                console.log(chalk.yellow('Hint: This might be a permission issue. Check file/directory permissions.'));
            }
            await inputUtils.waitForKey('\nPress any key to return to menu...');
        }
    }

    /**
     * Handle recovery operation with simplified Y/N confirmation
     */
    async handleRecovery() {
        try {
            console.clear();
            console.log(chalk.blue.bold('\n🔍 Recovery Operation\n'));

            // Get history
            const history = await ConfigManager.getHistory();
            
            if (history.length === 0) {
                console.log(chalk.yellow('No backup snapshots found.'));
                await inputUtils.waitForKey('\nPress any key to return to menu...');
                return;
            }

            // Show available snapshots (reverse chronological order)
            const reversedHistory = [...history].reverse();

            console.log(chalk.cyan('Available Snapshots:\n'));
            
            reversedHistory.forEach((entry, index) => {
                const date = new Date(entry.timestamp).toLocaleString('en-US', {
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                    hour12: false
                });
                
                console.log(`${chalk.bold((index + 1).toString().padStart(2))}. ${chalk.green(entry.id)}`);
                console.log(`    Date: ${chalk.gray(date)}`);
                console.log(`    Source: ${chalk.gray(entry.source)}`);
                console.log(`    Files: ${chalk.blue(entry.file_count?.toLocaleString() || 'N/A')}, Folders: ${chalk.blue(entry.folder_count?.toLocaleString() || 'N/A')}`);
                console.log(`    Size: ${chalk.blue(fsUtils.formatBytes(entry.total_bytes || 0))}`);

                this._printNotes(entry.user_notes, '    ');
                console.log('');
            });

            // Select snapshot
            const selection = await inputUtils.question(`Select snapshot (1-${reversedHistory.length}) or 0 to cancel: `);
            const selectedIndex = parseInt(selection.trim()) - 1;

            if (selection.trim() === '0') {
                console.log(chalk.yellow('Recovery cancelled.'));
                await inputUtils.waitForKey('\nPress any key to return to menu...');
                return;
            }

            if (selectedIndex < 0 || selectedIndex >= reversedHistory.length || isNaN(selectedIndex)) {
                console.log(chalk.red('Invalid selection.'));
                await inputUtils.waitForKey('\nPress any key to return to menu...');
                return;
            }

            const selectedEntry = reversedHistory[selectedIndex];

            // Get target path
            const defaultTarget = selectedEntry.source;
            console.log(`\nDefault target: ${chalk.gray(defaultTarget)}`);
            const targetPath = await inputUtils.question(`Enter target path (or press Enter for default): `);
            const finalTargetPath = targetPath.trim() || defaultTarget;

            // Validate target path permissions
            try {
                const targetDir = path.dirname(finalTargetPath);
                await fs.promises.mkdir(targetDir, { recursive: true });
                await fs.promises.access(targetDir, fs.constants.W_OK);
            } catch (error) {
                console.log(chalk.red(`⚠ Target path error: Cannot write to ${finalTargetPath}`));
                if (error.code === 'EACCES') {
                    console.log(chalk.yellow('Hint: Make sure you have write permission to the target directory'));
                }
                await inputUtils.waitForKey('\nPress any key to return to menu...');
                return;
            }

            // Show backup information before confirmation
            console.log('');
            RevyCore.displayBackupInfo(selectedEntry);
            console.log('');

            // Simplified Y/N confirmation
            const confirm = await inputUtils.getSingleKey(chalk.red('Proceed with destructive recovery? (y/N): '));

            if (confirm.toLowerCase() === 'y') {
                console.log(chalk.blue('\n🚀 Starting recovery operation...\n'));
                
                const result = await RevyCore.recovery(selectedEntry.id, finalTargetPath);
                
                console.log(chalk.green('\n Recovery operation completed successfully!'));
                await inputUtils.waitForKey('\nPress any key to return to menu...');
            } else {
                console.log(chalk.yellow('\n⚠ Recovery operation cancelled.'));
                await inputUtils.waitForKey('\nPress any key to return to menu...');
            }

        } catch (error) {
            console.log(chalk.red(`\n⚠ Recovery failed: ${error.message}`));
            if (error.code === 'EACCES') {
                console.log(chalk.yellow('Hint: This might be a permission issue. Check file/directory permissions.'));
            }
            await inputUtils.waitForKey('\nPress any key to return to menu...');
        }
    }

    /**
     * showVersion with robust fallback: try ConfigManager first, then read common config files
     */
    async showVersion() {
        // Try ConfigManager first (normal path)
        let version = '1.0';
        try {
            version = ConfigManager.get && typeof ConfigManager.get === 'function'
                ? ConfigManager.get('meta', 'version', '1.0')
                : '1.0';
        } catch (e) {
            version = '1.0';
        }

        // If version is still default or falsy, attempt to read config files directly
        if (!version || String(version).trim() === '' || String(version).trim() === '1.0') {
            try {
                const confVersion = await this._readVersionFromConfigFiles();
                if (confVersion) version = confVersion;
            } catch (e) {
                // swallow: we will print whatever we have
            }
        }

        console.log(chalk.whiteBright(`\nVersion ${version}`));
        process.exit(0);
    }

    /**
     * Helper: check several common config locations and parse [meta] version if present.
     */
    async _readVersionFromConfigFiles() {
        const possiblePaths = [];

        // 1) explicit REVY_CONFIG env path (common layout: $REVY_CONFIG/revy.conf)
        if (process.env.REVY_CONFIG) {
            possiblePaths.push(path.join(process.env.REVY_CONFIG, 'revy.conf'));
            possiblePaths.push(process.env.REVY_CONFIG);
        }

        // 2) REVY_HOME default path
        const homeConfig = process.env.REVY_HOME ? path.join(process.env.REVY_HOME, 'config', 'revy.conf')
                                                 : path.join(HOME, '.revy', 'config', 'revy.conf');
        possiblePaths.push(homeConfig);

        // 3) ~/.revy/revy.conf
        possiblePaths.push(path.join(HOME, '.revy', 'revy.conf'));

        // 4) /etc/revy.conf (system-wide)
        possiblePaths.push('/etc/revy.conf');

        // 5) fallback to working directory's revy.conf (useful for tests)
        possiblePaths.push(path.join(process.cwd(), 'revy.conf'));

        for (const p of possiblePaths) {
            try {
                if (!p) continue;
                if (await fs.promises.access(p).then(() => true).catch(() => false)) {
                    const content = await fs.promises.readFile(p, 'utf8');
                    // crude INI parse: find [meta] section then `version=`
                    const lower = content.toString();
                    const metaIdx = lower.indexOf('[meta]');
                    if (metaIdx >= 0) {
                        const afterMeta = lower.slice(metaIdx);
                        const m = afterMeta.match(/version\s*=\s*([^\r\n]+)/i);
                        if (m && m[1]) {
                            return m[1].trim();
                        }
                    } else {
                        // if no [meta], still try to find top-level version=
                        const m2 = lower.match(/^\s*version\s*=\s*([^\r\n]+)/im);
                        if (m2 && m2[1]) return m2[1].trim();
                    }
                }
            } catch (e) {
                // ignore read errors and continue
            }
        }

        return null;
    }

    /**
     * Show help information
     */
    async showHelp() {
        console.log(chalk.cyan.bold('\n📖 Revy Help\n'));
        
        console.log(chalk.green('Basic Usage:'));
        console.log('  revy                 - Show interactive menu');
        console.log('');
        
        console.log(chalk.green('Shortcut Commands:'));
        console.log('  revy -help           - Show this help');
        console.log('  revy -v              - Show version');
        console.log('  revy -history        - Show backup history');
        console.log('  revy -edit           - Edit configuration');
        console.log('  revy -Rsave          - Quick save (recent settings)');
        console.log('  revy -Rcove          - Quick recovery (recent)');
        console.log('');

        console.log(chalk.green('Configuration:'));
        console.log(`  Config file: ${chalk.gray(ConfigManager.getConfigPath())}`);
        console.log(`  History file: ${chalk.gray(ConfigManager.getHistoryPath())}`);
        console.log('');

        // Show current config summary
        console.log(chalk.green('Current Settings:'));
        console.log(`  Default source: ${chalk.gray(ConfigManager.get('save', 'source'))}`);
        console.log(`  Default destination: ${chalk.gray(ConfigManager.get('save', 'destination'))}`);
        console.log(`  Excluded patterns: ${chalk.gray(ConfigManager.getArray('save', 'excluded').join(', ') || 'none')}`);
        console.log(`  Auto-install: ${chalk.gray(ConfigManager.getBoolean('recovery', 'recovery_auto_install') ? 'enabled' : 'disabled')}`);
        console.log('');

        // Show recent backup info
        const history = await ConfigManager.getHistory();
        if (history.length > 0) {
            const recent = history[0];
            console.log(chalk.green('Most Recent Backup:'));
            console.log(`  ID: ${chalk.bold(recent.id)}`);
            console.log(`  Date: ${chalk.gray(new Date(recent.timestamp).toLocaleString('en-US', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: false
            }))}`);
            console.log(`  Source: ${chalk.gray(recent.source)}`);
            console.log(`  Files: ${chalk.blue((recent.file_count || 0).toLocaleString())}`);

            this._printNotes(recent.user_notes, '  ');
        }
        
        process.exit(0);
    }

    /**
     * Show backup history (fixed ordering)
     */
    async showHistory() {
        console.log(chalk.cyan.bold('\n📚 Backup History\n'));
    
        const history = await ConfigManager.getHistory();
    
        if (history.length === 0) {
            console.log(chalk.yellow('No backup history found.'));
            return;
        }

        // PERBAIKAN: Balik urutan agar yang terbaru muncul pertama (konsisten dengan handleRecovery)
        const reversedHistory = [...history].reverse();

        reversedHistory.forEach((entry, index) => {
            const date = new Date(entry.timestamp).toLocaleString('en-US', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: false
            });
            const lastRecovery = entry.last_recovery ? 
                    new Date(entry.last_recovery).toLocaleString('en-US', {
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                    hour12: false
                }) : 'Never';
                
            console.log(`${chalk.bold((index + 1).toString().padStart(3))}. ${chalk.green(entry.id)}`);
            console.log(`     Created: ${chalk.gray(date)}`);
            console.log(`     Source: ${chalk.blue(entry.source)}`);
            console.log(`     Destination: ${chalk.gray(entry.dest_root)}`);
            console.log(`     Files: ${chalk.cyan((entry.file_count || 0).toLocaleString())}, Folders: ${chalk.cyan((entry.folder_count || 0).toLocaleString())}`);
            console.log(`     Size: ${chalk.cyan(fsUtils.formatBytes(entry.total_bytes || 0))}`);
            console.log(`     Duration: ${chalk.yellow((entry.duration_seconds || 0) + 's')}`);
            console.log(`     Last Recovery: ${chalk.gray(lastRecovery)}`);

            this._printNotes(entry.user_notes, '     ');
                
            if (entry.excluded && entry.excluded.length > 0) {
                console.log(`     Excluded: ${chalk.gray(entry.excluded.join(', '))}`);
            }
            
            console.log('');
        });

        console.log(chalk.green(`Total snapshots: ${history.length}`));
        process.exit(0);
    }

    /**
     * Edit configuration file
     */
    async editConfig() {
        const configPath = ConfigManager.getConfigPath();
        const editor = process.env.EDITOR || 'nano';
        
        console.log(chalk.cyan(`\n Opening configuration file with ${editor}...`));
        console.log(chalk.gray(` Config file: ${configPath}`));
        
        try {
            const { spawn } = require('child_process');
            
            const child = spawn(editor, [configPath], {
                stdio: 'inherit'
            });

            await new Promise((resolve, reject) => {
                child.on('close', (code) => {
                    if (code === 0) {
                        resolve();
                    } else {
                        reject(new Error(`Editor exited with code ${code}`));
                    }
                });
                
                child.on('error', (error) => {
                    reject(error);
                });
            });
            
            // Reload configuration after editing
            console.log(chalk.green('\n Configuration file closed. Reloading settings...'));
            await ConfigManager.loadConfig();
            console.log(chalk.green(' Configuration reloaded successfully.'));
            
        } catch (error) {
            console.log(chalk.red(`\n⚠ Failed to open editor: ${error.message}`));
            console.log(chalk.yellow(`You can manually edit: ${configPath}`));
        }
        process.exit(0);
    }

    /**
     * Recent save - quick save with last used settings
     */
    async recentSave() {
        try {
            console.log(chalk.green.bold('\n⚡ Quick Save\n'));

            const history = await ConfigManager.getHistory();
            let defaultSource = ConfigManager.get('save', 'source');
            let defaultDest = ConfigManager.get('save', 'destination');
            
            // Use most recent backup settings if available
            if (history.length > 0) {
                const recent = history[0];
                defaultSource = recent.source;
                defaultDest = recent.dest_root;
                
                console.log(chalk.cyan('Using settings from most recent backup:'));
                console.log(`  Previous backup: ${chalk.bold(recent.id)}`);
                console.log(`  Date: ${chalk.gray(new Date(recent.timestamp).toLocaleString('en-US', {
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                    hour12: false
                }))}`);
                console.log('');
            }

            console.log(chalk.cyan('Quick Save Settings:'));
            console.log(`  Source: ${chalk.bold(defaultSource)}`);
            console.log(`  Destination: ${chalk.bold(defaultDest)}`);

            // Quick size calculation
            const spinner = ora('Calculating size...').start();
            try {
                const stats = await fsUtils.getDirectorySize(defaultSource);
                spinner.stop();
                console.log(`  Estimated size: ${chalk.blue(fsUtils.formatBytes(stats.totalSize))}`);
                console.log(`  Files: ${chalk.blue(stats.fileCount.toLocaleString())}`);
            } catch (error) {
                spinner.stop();
                console.log(chalk.yellow(`  Warning: Could not calculate size: ${error.message}`));
            }

            const confirm = await inputUtils.getSingleKey(chalk.yellow('\nProceed with quick save? (y/N): '));
            
            if (confirm.toLowerCase() === 'y') {
                const excludePatterns = ConfigManager.getArray('save', 'excluded', ',', []);
                const userNotes = 'Quick save via -Rsave';
                
                console.log(chalk.green('\n🚀 Starting quick save...\n'));
                
                const result = await RevyCore.save(defaultSource, defaultDest, userNotes, excludePatterns);
                
                console.log(chalk.green('\n Quick save completed successfully!'));
            } else {
                console.log(chalk.yellow('\n⚠ Quick save cancelled.'));
            }

        } catch (error) {
            console.log(chalk.red(`\n⚠ Quick save failed: ${error.message}`));
        }
        process.exit(0);
    }

    /**
     * Recent recovery - quick recovery of most recent backup
     */
    async recentRecovery() {
        try {
            console.log(chalk.blue.bold('\n⚡ Quick Recovery\n'));

            const history = await ConfigManager.getHistory();
            
            if (history.length === 0) {
                console.log(chalk.yellow('No backup snapshots found for quick recovery.'));
                process.exit(0);
            }

            const recent = history[0];
            const targetPath = recent.source;

            // Show backup information before confirmation
            console.log('');
            RevyCore.displayBackupInfo(recent);
            console.log('');

            console.log(chalk.cyan('Quick Recovery Settings:'));
            console.log(`  Target: ${chalk.bold(targetPath)}`);

            const confirm = await inputUtils.getSingleKey(chalk.red('\nProceed with quick recovery? (y/N): '));

            if (confirm.toLowerCase() === 'y') {
                console.log(chalk.blue('\n🚀 Starting quick recovery...\n'));
                
                const result = await RevyCore.recovery(recent.id, targetPath);
                
                console.log(chalk.green('\n Quick recovery completed successfully!'));
            } else {
                console.log(chalk.yellow('\n⚠ Quick recovery cancelled.'));
            }

        } catch (error) {
            console.log(chalk.red(`\n⚠ Quick recovery failed: ${error.message}`));
        }
        process.exit(0);
    }

    /**
     * Format duration for display
     */
    formatDuration(seconds) {
        if (seconds < 60) {
            return `${seconds}s`;
        } else if (seconds < 3600) {
            const minutes = Math.floor(seconds / 60);
            const remainingSeconds = seconds % 60;
            return `${minutes}m ${remainingSeconds}s`;
        } else {
            const hours = Math.floor(seconds / 3600);
            const minutes = Math.floor((seconds % 3600) / 60);
            return `${hours}h ${minutes}m`;
        }
    }

    /**
     * Process command line arguments
     */
    async processArgs(args) {
        if (args.length === 0) {
            return await this.showMainMenu();
        }

        const command = args[0];

        switch (command) {
            case '-help':
            case '--help':
            case '-h':
                await this.showHelp();
                break;
                
            case '-v':
            case '--version':
            case '-version':
                await this.showVersion();
                break;
                
            case '-history':
            case '--history':
                await this.showHistory();
                break;
                
            case '-edit':
            case '--edit':
                await this.editConfig();
                break;
                
            case '-Rsave':
            case '--recent-save':
                await this.recentSave();
                break;
                
            case '-Rcove':
            case '--recent-recovery':
                await this.recentRecovery();
                break;
                
            default:
                console.log(chalk.red(`Unknown command: ${command}`));
                console.log(chalk.yellow('Use "revy -help" to see available commands.'));
                process.exit(1);
        }
    }

    /**
     * Clean up and exit gracefully
     */
    async cleanup() {
        this.isRunning = false;
        // Any cleanup code here
        process.exit(0);
    }
}

// Handle process signals for graceful shutdown
process.on('SIGINT', async () => {
    console.log(chalk.yellow('\n\n🛑 Received interrupt signal. Cleaning up...'));
    const cli = new CliInterface();
    await cli.cleanup();
});

process.on('SIGTERM', async () => {
    console.log(chalk.yellow('\n\n🛑 Received termination signal. Cleaning up...'));
    const cli = new CliInterface();
    await cli.cleanup();
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    console.error(chalk.red('\n💥 Uncaught Exception:'), error.message);
    console.error(chalk.gray('Stack trace:'), error.stack);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error(chalk.red('\n💥 Unhandled Promise Rejection:'), reason);
    process.exit(1);
});

// Export singleton instance
module.exports = new CliInterface();