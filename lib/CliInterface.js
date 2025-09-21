/**
 * CliInterface.js - Updated Version
 * Command Line Interface for Revy
 * Changes: Y/N confirmation, single key navigation, version display, 24h format, tree format history
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
    console.error('⚠  Failed to load required modules:', error.message);
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
            console.error(chalk.red('⚠  Initialization failed:'), error.message);
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
     * Helper: print notes with tree format
     */
    _printNotesTree(notes, isLast = false, indent = '') {
        const prefix = isLast ? '└──' : '├──';
        const continuePrefix = isLast ? '    ' : '│   ';
        
        if (!notes || notes === 'Null') {
            console.log(`${indent}${prefix} ${chalk.bold.blue('Notes:')} ${chalk.gray('None')}`);
            return;
        }

        const lines = notes.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
        if (lines.length === 0) {
            console.log(`${indent}${prefix} ${chalk.bold.blue('Notes:')} ${chalk.gray('None')}`);
            return;
        }

        if (lines.length === 1) {
            console.log(`${indent}${prefix} ${chalk.bold.blue('Notes:')}`);
            console.log(`${indent}${continuePrefix}    └── ${chalk.cyan(lines[0])}`);
        } else {
            console.log(`${indent}${prefix} ${chalk.bold.blue('Notes:')}`);
            console.log(`${indent}${continuePrefix}    ├── ${chalk.cyan(lines[0])}`);
            console.log(`${indent}${continuePrefix}    │`);
            for (let i = 1; i < lines.length; i++) {
                console.log(`${indent}${continuePrefix}    │   ${chalk.cyan(lines[i])}`);
            }
            console.log(`${indent}${continuePrefix}    │`);
            console.log(`${indent}${continuePrefix}    └${'─'.repeat(40)}`);
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
            console.log(chalk.cyanBright.bold('\nRevy - Save & Recovery Tool\n'));
            console.log(chalk.whiteBright('Choose an option:'));
            console.log(chalk.greenBright('  1. Save'));
            console.log(chalk.blueBright('  2. Recovery'));
            console.log(chalk.red('  3. Exit'));
            console.log(chalk.yellowBright('\nPress a key (1-3):'));

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
                    console.log(chalk.yellowBright('\nGoodbye!'));
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
     * Handle save operation with tree format
     */
    async handleSave() {
        try {
            console.clear();
            console.log(chalk.green.bold('\nSave Operation\n'));

            // Get source path
            const defaultSource = ConfigManager.get('save', 'source', path.join(HOME, 'Projects'));
            console.log(chalk.cyan('Source Configuration'));
            console.log(`     └── ${chalk.bold.blue('Default:')} ${chalk.gray(defaultSource)}`);
            const sourcePath = await inputUtils.question(`\nEnter source path (or press Enter for default): `);
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
                console.log(chalk.red(`\n⚠  Source path error: ${error.message}`));
                if (error.code === 'EACCES') {
                    console.log(`     └── ${chalk.yellow('Hint: Make sure you have read permission to this directory')}`);
                }
                await inputUtils.waitForKey('\nPress any key to return to menu...');
                return;
            }

            // Get destination path
            const defaultDest = ConfigManager.get('save', 'destination', path.join(HOME, 'Backups'));
            console.log(chalk.cyan('\nDestination Configuration'));
            console.log(`     └── ${chalk.bold.blue('Default:')} ${chalk.gray(defaultDest)}`);
            const destPath = await inputUtils.question(`\nEnter destination path (or press Enter for default): `);
            const finalDestPath = destPath.trim() || defaultDest;

            // Validate destination is writable (create if needed)
            try {
                await fs.promises.mkdir(finalDestPath, { recursive: true });
                await fs.promises.access(finalDestPath, fs.constants.W_OK);
            } catch (error) {
                console.log(chalk.red(`\n⚠  Destination path error: Cannot write to ${finalDestPath}`));
                if (error.code === 'EACCES') {
                    console.log(`     └── ${chalk.yellow('Hint: Make sure you have write permission to this directory')}`);
                }
                await inputUtils.waitForKey('\nPress any key to return to menu...');
                return;
            }

            // Show pre-save summary with tree format
            console.log(chalk.cyan('\nPre-Save Analysis'));
            console.log(`     ├── ${chalk.bold.blue('Source:')} ${chalk.bold(finalSourcePath)}`);
            console.log(`     ├── ${chalk.bold.blue('Destination:')} ${chalk.bold(finalDestPath)}`);

            // Calculate and show estimated size
            const spinner = ora('Calculating size...').start();
            try {
                const stats = await fsUtils.getDirectorySize(finalSourcePath);
                const excludePatterns = ConfigManager.getArray('save', 'excluded', ',', []);
                
                spinner.stop();
                
                console.log(`     ├── ${chalk.bold.blue('Statistics')}`);
                console.log(`     │       ├── ${chalk.bold.gray('Size:')} ${chalk.blue(fsUtils.formatBytes(stats.totalSize))}`);
                console.log(`     │       ├── ${chalk.bold.gray('Files:')} ${chalk.blue(stats.fileCount.toLocaleString())}`);
                console.log(`     │       └── ${chalk.bold.gray('Folders:')} ${chalk.blue(stats.folderCount.toLocaleString())}`);
                console.log(`     └── ${chalk.bold.blue('Excluded patterns:')} ${chalk.red(excludePatterns.join(', ') || 'none')}`);
            } catch (error) {
                spinner.stop();
                console.log(`     ├── ${chalk.bold.blue('Statistics')}`);
                console.log(`     │       └── ${chalk.yellow(`Warning: Could not calculate size: ${error.message}`)}`);
                const excludePatterns = ConfigManager.getArray('save', 'excluded', ',', []);
                console.log(`     └── ${chalk.bold.blue('Excluded patterns:')} ${chalk.red(excludePatterns.join(', ') || 'none')}`);
            }

            // Get user notes
            console.log(chalk.yellow('\nUser Notes (optional):'));
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

            // Final confirmation with tree format
            console.log(chalk.cyan('\nFinal Summary'));
            console.log(`     ├── ${chalk.bold.blue('Source:')} ${chalk.bold(finalSourcePath)}`);
            console.log(`     ├── ${chalk.bold.blue('Destination:')} ${chalk.bold(finalDestPath)}`);
            this._printNotesTree(userNotes, true, '     ');

            const confirm = await inputUtils.getSingleKey(chalk.yellow('\nProceed with save operation? (y/N): '));
            
            if (confirm.toLowerCase() === 'y') {
                const excludePatterns = ConfigManager.getArray('save', 'excluded', ',', []);
                
                console.log(chalk.green('\nStarting save operation...\n'));
                
                const result = await RevyCore.save(finalSourcePath, finalDestPath, userNotes, excludePatterns);
                
                console.log(chalk.green('\n✓ Save operation completed successfully!'));
                await inputUtils.waitForKey('\nPress any key to return to menu...');
            } else {
                console.log(chalk.yellow('\n⚠  Save operation cancelled.'));
                await inputUtils.waitForKey('\nPress any key to return to menu...');
            }

        } catch (error) {
            console.log(chalk.red(`\n⚠  Save failed: ${error.message}`));
            if (error.code === 'EACCES') {
                console.log(`     └── ${chalk.yellow('Hint: This might be a permission issue. Check file/directory permissions.')}`);
            }
            await inputUtils.waitForKey('\nPress any key to return to menu...');
        }
    }

    /**
     * Handle recovery operation with tree format
     */
    async handleRecovery() {
        try {
            console.clear();
            console.log(chalk.blue.bold('\nRecovery Operation\n'));

            // Get history
            const history = await ConfigManager.getHistory();
            
            if (history.length === 0) {
                console.log(chalk.yellow('No backup snapshots found.'));
                await inputUtils.waitForKey('\nPress any key to return to menu...');
                return;
            }

            // Show available snapshots (reverse chronological order) with tree format
            const reversedHistory = [...history].reverse();

            console.log(chalk.cyan('Available Snapshots\n'));
            
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
                console.log(`     ├── ${chalk.bold.blue('Date:')} ${chalk.gray(date)}`);
                console.log(`     ├── ${chalk.bold.blue('Source:')} ${chalk.gray(entry.source)}`);
                console.log(`     ├── ${chalk.bold.blue('Statistics')}`);
                console.log(`     │       ├── ${chalk.bold.gray('Files:')} ${chalk.blue(entry.file_count?.toLocaleString() || 'N/A')}`);
                console.log(`     │       ├── ${chalk.bold.gray('Folders:')} ${chalk.blue(entry.folder_count?.toLocaleString() || 'N/A')}`);
                console.log(`     │       └── ${chalk.bold.gray('Size:')} ${chalk.blue(fsUtils.formatBytes(entry.total_bytes || 0))}`);

                // Notes with tree format
                if (entry.user_notes && entry.user_notes !== 'Null') {
                    const lines = entry.user_notes.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
                    if (lines.length > 0) {
                        if (lines.length === 1) {
                            console.log(`     └── ${chalk.bold.blue('Notes:')}`);
                            console.log(`             └── ${chalk.cyan(lines[0])}`);
                        } else {
                            console.log(`     └── ${chalk.bold.blue('Notes:')}`);
                            console.log(`             ├── ${chalk.cyan(lines[0])}`);
                            console.log(`             │`);
                            for (let i = 1; i < lines.length; i++) {
                                console.log(`             │   ${chalk.cyan(lines[i])}`);
                            }
                            console.log(`             │`);
                            console.log(`             └${'─'.repeat(40)}`);
                        }
                    }
                } else {
                    console.log(`     └── ${chalk.bold.blue('Notes:')} ${chalk.gray('None')}`);
                }
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
            console.log(chalk.cyan('\nTarget Configuration'));
            console.log(`     └── ${chalk.bold.blue('Default:')} ${chalk.gray(defaultTarget)}`);
            const targetPath = await inputUtils.question(`\nEnter target path (or press Enter for default): `);
            const finalTargetPath = targetPath.trim() || defaultTarget;

            // Validate target path permissions
            try {
                const targetDir = path.dirname(finalTargetPath);
                await fs.promises.mkdir(targetDir, { recursive: true });
                await fs.promises.access(targetDir, fs.constants.W_OK);
            } catch (error) {
                console.log(chalk.red(`\n⚠  Target path error: Cannot write to ${finalTargetPath}`));
                if (error.code === 'EACCES') {
                    console.log(`     └── ${chalk.yellow('Hint: Make sure you have write permission to the target directory')}`);
                }
                await inputUtils.waitForKey('\nPress any key to return to menu...');
                return;
            }

            // Show backup information before confirmation with tree format
            console.log(chalk.cyan('\nRecovery Summary'));
            console.log(`     ├── ${chalk.bold.blue('Backup ID:')} ${chalk.green(selectedEntry.id)}`);
            console.log(`     ├── ${chalk.bold.blue('Target:')} ${chalk.bold(finalTargetPath)}`);
            console.log(`     ├── ${chalk.bold.blue('Source Backup:')}`);
            console.log(`     │       ├── ${chalk.bold.gray('Original path:')} ${chalk.yellow(selectedEntry.source)}`);
            console.log(`     │       ├── ${chalk.bold.gray('Files:')} ${chalk.blue((selectedEntry.file_count || 0).toLocaleString())}`);
            console.log(`     │       ├── ${chalk.bold.gray('Size:')} ${chalk.blue(fsUtils.formatBytes(selectedEntry.total_bytes || 0))}`);
            console.log(`     │       └── ${chalk.bold.gray('Created:')} ${chalk.white(new Date(selectedEntry.timestamp).toLocaleString('en-US', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: false
            }))}`);

            // Notes
            if (selectedEntry.user_notes && selectedEntry.user_notes !== 'Null') {
                const lines = selectedEntry.user_notes.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
                if (lines.length > 0) {
                    if (lines.length === 1) {
                        console.log(`     └── ${chalk.bold.blue('Notes:')}`);
                        console.log(`             └── ${chalk.cyan(lines[0])}`);
                    } else {
                        console.log(`     └── ${chalk.bold.blue('Notes:')}`);
                        console.log(`             ├── ${chalk.cyan(lines[0])}`);
                        console.log(`             │`);
                        for (let i = 1; i < lines.length; i++) {
                            console.log(`             │   ${chalk.cyan(lines[i])}`);
                        }
                        console.log(`             │`);
                        console.log(`             └${'─'.repeat(40)}`);
                    }
                }
            } else {
                console.log(`     └── ${chalk.bold.blue('Notes:')} ${chalk.gray('None')}`);
            }

            // Simplified Y/N confirmation
            const confirm = await inputUtils.getSingleKey(chalk.red('\nProceed with destructive recovery? (y/N): '));

            if (confirm.toLowerCase() === 'y') {
                console.log(chalk.blue('\nStarting recovery operation...\n'));
                
                const result = await RevyCore.recovery(selectedEntry.id, finalTargetPath);
                
                console.log(chalk.green('\n✓ Recovery operation completed successfully!'));
                await inputUtils.waitForKey('\nPress any key to return to menu...');
            } else {
                console.log(chalk.yellow('\n⚠  Recovery operation cancelled.'));
                await inputUtils.waitForKey('\nPress any key to return to menu...');
            }

        } catch (error) {
            console.log(chalk.red(`\n⚠  Recovery failed: ${error.message}`));
            if (error.code === 'EACCES') {
                console.log(`     └── ${chalk.yellow('Hint: This might be a permission issue. Check file/directory permissions.')}`);
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
     * Show help information with tree format
     */
    async showHelp() {
        console.log(chalk.cyan.bold('\nRevy Help'));
        console.log(`     ├── ${chalk.bold.green('Basic Usage')}`);
        console.log(`     │       └── ${chalk.white('revy')} ${chalk.gray('- Show interactive menu')}`);
        console.log(`     │`);
        console.log(`     ├── ${chalk.bold.green('Shortcut Commands')}`);
        console.log(`     │       ├── ${chalk.white('revy -help')} ${chalk.gray('- Show this help')}`);
        console.log(`     │       ├── ${chalk.white('revy -v')} ${chalk.gray('- Show version')}`);
        console.log(`     │       ├── ${chalk.white('revy -history')} ${chalk.gray('- Show backup history')}`);
        console.log(`     │       ├── ${chalk.white('revy -edit')} ${chalk.gray('- Edit configuration')}`);
        console.log(`     │       ├── ${chalk.white('revy -Rsave')} ${chalk.gray('- Quick save (recent settings)')}`);
        console.log(`     │       └── ${chalk.white('revy -Rcove')} ${chalk.gray('- Quick recovery (recent)')}`);
        console.log(`     │`);
        console.log(`     ├── ${chalk.bold.green('Configuration')}`);
        console.log(`     │       ├── ${chalk.bold.blue('Config file:')} ${chalk.yellow(ConfigManager.getConfigPath())}`);
        console.log(`     │       └── ${chalk.bold.blue('History file:')} ${chalk.yellow(ConfigManager.getHistoryPath())}`);
        console.log(`     │`);
        console.log(`     ├── ${chalk.bold.green('Default Current Settings')}`);
        console.log(`     │       ├── ${chalk.bold.blue('Default source:')} ${chalk.cyan(ConfigManager.get('save', 'source'))}`);
        console.log(`     │       ├── ${chalk.bold.blue('Default destination:')} ${chalk.cyan(ConfigManager.get('save', 'destination'))}`);
        console.log(`     │       ├── ${chalk.bold.blue('Excluded patterns:')} ${chalk.red(ConfigManager.getArray('save', 'excluded').join(', ') || 'none')}`);
        console.log(`     │       └── ${chalk.bold.blue('Auto-install:')} ${chalk.magenta(ConfigManager.getBoolean('recovery', 'recovery_auto_install') ? 'enabled' : 'disabled')}`);
        console.log(`     │`);

        // Show recent backup info
        const history = await ConfigManager.getHistory();
        if (history.length > 0) {
            const recent = history[0];
            const date = new Date(recent.timestamp).toLocaleString('en-US', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: false
            });

            console.log(`     └── ${chalk.bold.green('Most Recent Backup')}`);
            console.log(`             ├── ${chalk.bold.blue('ID:')} ${chalk.green(recent.id)}`);
            console.log(`             ├── ${chalk.bold.blue('Date:')} ${chalk.white(date)}`);
            console.log(`             ├── ${chalk.bold.blue('Source:')} ${chalk.yellow(recent.source)}`);
            console.log(`             ├── ${chalk.bold.blue('Files:')} ${chalk.green((recent.file_count || 0).toLocaleString())}`);
            
            // Notes formatting for help
            if (recent.user_notes && recent.user_notes !== 'Null') {
                const lines = recent.user_notes.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
                if (lines.length > 0) {
                    if (lines.length === 1) {
                        console.log(`             └── ${chalk.bold.blue('Notes:')}`);
                        console.log(`                     └── ${chalk.cyan(lines[0])}`);
                    } else {
                        console.log(`             └── ${chalk.bold.blue('Notes:')}`);
                        console.log(`                     ├── ${chalk.cyan(lines[0])}`);
                        console.log(`                     │`);
                        for (let i = 1; i < lines.length; i++) {
                            console.log(`                     │   ${chalk.cyan(lines[i])}`);
                        }
                        console.log(`                     │`);
                        console.log(`                     └${'─'.repeat(40)}`);
                    }
                }
            } else {
                console.log(`             └── ${chalk.bold.blue('Notes:')} ${chalk.gray('None')}`);
            }
        } else {
            console.log(`     └── ${chalk.bold.green('Most Recent Backup')}`);
            console.log(`             └── ${chalk.gray('No backups found')}`);
        }
        
        process.exit(0);
    }

    /**
     * Show backup history with tree format (fixed ordering)
     */
    async showHistory() {
        console.log(chalk.cyan.bold('\nBackup History\n'));
    
        const history = await ConfigManager.getHistory();
    
        if (history.length === 0) {
            console.log(chalk.yellow('No backup history found.'));
            return;
        }

        // Show newest first (consistent with handleRecovery)
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

            // Tree format without emoticons
            console.log(`${chalk.bold.cyan((index + 1).toString().padStart(3))}. ${chalk.bold.green(entry.id)}`);
            console.log(`     ├── ${chalk.bold.blue('Created:')} ${chalk.white(date)}`);
            console.log(`     ├── ${chalk.bold.blue('Transfer')}`);
            console.log(`     │       ├── ${chalk.bold.gray('From:')} ${chalk.yellow(entry.source)}`);
            console.log(`     │       └── ${chalk.bold.gray('To:')} ${chalk.cyan(entry.dest_root)}`);
            console.log(`     ├── ${chalk.bold.blue('Statistics')}`);
            console.log(`     │       ├── ${chalk.bold.gray('Files:')} ${chalk.green((entry.file_count || 0).toLocaleString())}`);
            console.log(`     │       ├── ${chalk.bold.gray('Folders:')} ${chalk.green((entry.folder_count || 0).toLocaleString())}`);
            console.log(`     │       ├── ${chalk.bold.gray('Size:')} ${chalk.green(fsUtils.formatBytes(entry.total_bytes || 0))}`);
            console.log(`     │       └── ${chalk.bold.gray('Duration:')} ${chalk.magenta((entry.duration_seconds || 0) + 's')}`);
            console.log(`     ├── ${chalk.bold.blue('Last Recovery:')} ${chalk.white(lastRecovery)}`);
            
            // Notes with special formatting for multi-line
            if (entry.user_notes && entry.user_notes !== 'Null') {
                const lines = entry.user_notes.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
                if (lines.length > 0) {
                    if (lines.length === 1) {
                        // Single line - simple format
                        console.log(`     ├── ${chalk.bold.blue('Notes:')}`);
                        console.log(`     │       └── ${chalk.cyan(lines[0])}`);
                    } else {
                        // Multi-line - special format
                        console.log(`     ├── ${chalk.bold.blue('Notes:')}`);
                        console.log(`     │       ├── ${chalk.cyan(lines[0])}`); // First line
                        console.log(`     │       │`);
                        for (let i = 1; i < lines.length; i++) {
                            console.log(`     │       │   ${chalk.cyan(lines[i])}`);
                        }
                        console.log(`     │       │`);
                        console.log(`     │       └${'─'.repeat(40)}`);
                        console.log(`     │`);
                    }
                }
            } else {
                console.log(`     ├── ${chalk.bold.blue('Notes:')} ${chalk.gray('None')}`);
            }
            
            // Excluded patterns in red
            if (entry.excluded && entry.excluded.length > 0) {
                console.log(`     └── ${chalk.bold.blue('Excluded:')} ${chalk.red(entry.excluded.join(', '))}`);
            } else {
                console.log(`     └── ${chalk.bold.blue('Excluded:')} ${chalk.gray('None')}`);
            }
            
            console.log(''); // Empty line for separation
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
        
        console.log(chalk.cyan(`\nOpening configuration file with ${editor}...`));
        console.log(chalk.gray(`Config file: ${configPath}`));
        
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
            console.log(chalk.green('\nConfiguration file closed. Reloading settings...'));
            await ConfigManager.loadConfig();
            console.log(chalk.green('Configuration reloaded successfully.'));
            
        } catch (error) {
            console.log(chalk.red(`\n⚠  Failed to open editor: ${error.message}`));
            console.log(chalk.yellow(`You can manually edit: ${configPath}`));
        }
        process.exit(0);
    }

    /**
     * Recent save - quick save with last used settings with tree format
     */
    async recentSave() {
        try {
            console.log(chalk.green.bold('\nQuick Save\n'));

            const history = await ConfigManager.getHistory();
            let defaultSource = ConfigManager.get('save', 'source');
            let defaultDest = ConfigManager.get('save', 'destination');
            
            // Use most recent backup settings if available
            if (history.length > 0) {
                const recent = history[0];
                defaultSource = recent.source;
                defaultDest = recent.dest_root;
                
                console.log(chalk.cyan('Reference Backup'));
                console.log(`     ├── ${chalk.bold.blue('Previous backup:')} ${chalk.bold(recent.id)}`);
                console.log(`     ├── ${chalk.bold.blue('Date:')} ${chalk.gray(new Date(recent.timestamp).toLocaleString('en-US', {
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                    hour12: false
                }))}`);
                console.log(`     └── ${chalk.bold.blue('Using previous settings')}`);
                console.log('');
            }

            console.log(chalk.cyan('Quick Save Configuration'));
            console.log(`     ├── ${chalk.bold.blue('Source:')} ${chalk.bold(defaultSource)}`);
            console.log(`     └── ${chalk.bold.blue('Destination:')} ${chalk.bold(defaultDest)}`);

            // Quick size calculation
            const spinner = ora('Calculating size...').start();
            try {
                const stats = await fsUtils.getDirectorySize(defaultSource);
                spinner.stop();
                console.log('');
                console.log(chalk.cyan('Size Analysis'));
                console.log(`     ├── ${chalk.bold.blue('Estimated size:')} ${chalk.blue(fsUtils.formatBytes(stats.totalSize))}`);
                console.log(`     └── ${chalk.bold.blue('Files:')} ${chalk.blue(stats.fileCount.toLocaleString())}`);
            } catch (error) {
                spinner.stop();
                console.log('');
                console.log(chalk.cyan('Size Analysis'));
                console.log(`     └── ${chalk.yellow(`Warning: Could not calculate size: ${error.message}`)}`);
            }

            const confirm = await inputUtils.getSingleKey(chalk.yellow('\nProceed with quick save? (y/N): '));
            
            if (confirm.toLowerCase() === 'y') {
                const excludePatterns = ConfigManager.getArray('save', 'excluded', ',', []);
                const userNotes = 'Quick save via -Rsave';
                
                console.log(chalk.green('\nStarting quick save...\n'));
                
                const result = await RevyCore.save(defaultSource, defaultDest, userNotes, excludePatterns);
                
                console.log(chalk.green('\n✓ Quick save completed successfully!'));
            } else {
                console.log(chalk.yellow('\n⚠  Quick save cancelled.'));
            }

        } catch (error) {
            console.log(chalk.red(`\n⚠  Quick save failed: ${error.message}`));
        }
        process.exit(0);
    }

    /**
     * Recent recovery - quick recovery of most recent backup with tree format
     */
    async recentRecovery() {
        try {
            console.log(chalk.blue.bold('\nQuick Recovery\n'));

            const history = await ConfigManager.getHistory();
            
            if (history.length === 0) {
                console.log(chalk.yellow('No backup snapshots found for quick recovery.'));
                process.exit(0);
            }

            const recent = history[0];
            const targetPath = recent.source;

            // Show backup information before confirmation with tree format
            console.log(chalk.cyan('Recent Backup Information'));
            console.log(`     ├── ${chalk.bold.blue('Backup ID:')} ${chalk.green(recent.id)}`);
            console.log(`     ├── ${chalk.bold.blue('Created:')} ${chalk.white(new Date(recent.timestamp).toLocaleString('en-US', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: false
            }))}`);
            console.log(`     ├── ${chalk.bold.blue('Statistics')}`);
            console.log(`     │       ├── ${chalk.bold.gray('Files:')} ${chalk.green((recent.file_count || 0).toLocaleString())}`);
            console.log(`     │       ├── ${chalk.bold.gray('Folders:')} ${chalk.green((recent.folder_count || 0).toLocaleString())}`);
            console.log(`     │       └── ${chalk.bold.gray('Size:')} ${chalk.green(fsUtils.formatBytes(recent.total_bytes || 0))}`);

            // Notes
            if (recent.user_notes && recent.user_notes !== 'Null') {
                const lines = recent.user_notes.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
                if (lines.length > 0) {
                    if (lines.length === 1) {
                        console.log(`     ├── ${chalk.bold.blue('Notes:')}`);
                        console.log(`     │       └── ${chalk.cyan(lines[0])}`);
                    } else {
                        console.log(`     ├── ${chalk.bold.blue('Notes:')}`);
                        console.log(`     │       ├── ${chalk.cyan(lines[0])}`);
                        console.log(`     │       │`);
                        for (let i = 1; i < lines.length; i++) {
                            console.log(`     │       │   ${chalk.cyan(lines[i])}`);
                        }
                        console.log(`     │       │`);
                        console.log(`     │       └${'─'.repeat(40)}`);
                    }
                }
            } else {
                console.log(`     ├── ${chalk.bold.blue('Notes:')} ${chalk.gray('None')}`);
            }
            
            console.log(`     └── ${chalk.bold.blue('Target:')} ${chalk.bold(targetPath)}`);

            const confirm = await inputUtils.getSingleKey(chalk.red('\nProceed with quick recovery? (y/N): '));

            if (confirm.toLowerCase() === 'y') {
                console.log(chalk.blue('\nStarting quick recovery...\n'));
                
                const result = await RevyCore.recovery(recent.id, targetPath);
                
                console.log(chalk.green('\n✓ Quick recovery completed successfully!'));
            } else {
                console.log(chalk.yellow('\n⚠  Quick recovery cancelled.'));
            }

        } catch (error) {
            console.log(chalk.red(`\n⚠  Quick recovery failed: ${error.message}`));
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
    console.log(chalk.yellow('\n\nReceived interrupt signal. Cleaning up...'));
    const cli = new CliInterface();
    await cli.cleanup();
});

process.on('SIGTERM', async () => {
    console.log(chalk.yellow('\n\nReceived termination signal. Cleaning up...'));
    const cli = new CliInterface();
    await cli.cleanup();
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    console.error(chalk.red('\nUncaught Exception:'), error.message);
    console.error(chalk.gray('Stack trace:'), error.stack);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error(chalk.red('\nUnhandled Promise Rejection:'), reason);
    process.exit(1);
});

// Export singleton instance
module.exports = new CliInterface();
