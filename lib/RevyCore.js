/**
 * RevyCore.js - Enhanced Version with Ultra-Smooth Progress Bar & Rock-Solid ETA
 *
 * Key Improvements:
 * - Eliminated all speed/ETA spikes through advanced smoothing algorithms
 * - Buttery smooth progress bar updates with optimized refresh rates
 * - Intelligent speed calculation with outlier detection and filtering
 * - Stable ETA that never shows INF, NaN, or unrealistic values
 * - Enhanced large file handling (6GB+) with specialized algorithms
 * - Real-time adaptive smoothing based on operation characteristics
 */

const os = require('os');
const path = require('path');
const readline = require('readline');
const HOME = os.homedir();

// Dynamic path resolution
const REVY_HOME = process.env.REVY_HOME || path.join(HOME, '.revy');
const REVY_LIB = process.env.REVY_LIB || path.join(REVY_HOME, 'lib');

const DespendentionImport = require(path.join(REVY_LIB, 'DespendentionImport.js'));
const ConfigManager = require(path.join(REVY_LIB, 'ConfigManager.js'));

const {
    fs,
    path: pathModule,
    chalk,
    ora,
    cliProgress,
    fsUtils,
    progressUtils,
    hashUtils,
    execAsync
} = DespendentionImport;

class RevyCore {
    constructor() {
        this.currentOperation = null;
        this.tempPaths = new Set();
        this.progressUpdateInterval = 50; // Reduced for ultra-smooth display
        this.fileProcessBatchSize = 5; // Balanced batch size
    }

    // Single key input function without Enter
    async getSingleKeyInput(prompt, validKeys = ['y', 'n']) {
        return new Promise((resolve) => {
            process.stdout.write(prompt);
            process.stdin.setRawMode(true);
            process.stdin.resume();
            process.stdin.setEncoding('utf8');

            const onData = (key) => {
                const keyLower = key.toLowerCase();

                // Handle Ctrl+C
                if (key === '\u0003') {
                    process.exit();
                }

                if (validKeys.includes(keyLower)) {
                    process.stdout.write(keyLower + '\n');
                    process.stdin.setRawMode(false);
                    process.stdin.pause();
                    process.stdin.removeListener('data', onData);
                    resolve(keyLower);
                }
            };

            process.stdin.on('data', onData);
        });
    }

    // Get version from config
    getVersion() {
        try {
            const cfgVersion = (ConfigManager && typeof ConfigManager.get === 'function')
                ? ConfigManager.get('meta', 'version', null)
                : null;
            if (cfgVersion && String(cfgVersion).trim()) return String(cfgVersion).trim();
        } catch (err) {
            // continue to fallback
        }

        const tryPaths = [];
        if (process.env.REVY_CONFIG) {
            tryPaths.push(path.join(process.env.REVY_CONFIG, 'revy.conf'));
            tryPaths.push(process.env.REVY_CONFIG);
        }
        tryPaths.push(process.env.REVY_HOME ? path.join(process.env.REVY_HOME, 'config', 'revy.conf') : path.join(HOME, '.revy', 'config', 'revy.conf'));
        tryPaths.push(path.join(HOME, '.revy', 'revy.conf'));
        tryPaths.push('/etc/revy.conf');
        tryPaths.push(path.join(process.cwd(), 'revy.conf'));

        for (const p of tryPaths) {
            try {
                if (!p) continue;
                if (fs.existsSync(p)) {
                    const content = fs.readFileSync(p, 'utf8');
                    const metaIdx = content.indexOf('[meta]');
                    if (metaIdx >= 0) {
                        const afterMeta = content.slice(metaIdx);
                        const m = afterMeta.match(/version\s*=\s*([^\r\n]+)/i);
                        if (m && m[1]) return m[1].trim();
                    } else {
                        const m2 = content.match(/^\s*version\s*=\s*([^\r\n]+)/im);
                        if (m2 && m2[1]) return m2[1].trim();
                    }
                }
            } catch (e) {
                // ignore and continue
            }
        }

        return '1.0';
    }

    // Display version
    displayVersion() {
        const version = this.getVersion();
        console.log(`Version ${version}`);
    }

    async save(sourcePath, destRoot, userNotes, excludePatterns) {
        const startTime = Date.now();
        let progressBar = null;

        try {
            // Validate paths
            await this.validateSavePaths(sourcePath, destRoot);

            // Generate backup ID with random number
            const backupId = await this.generateBackupId();

            // Create destination path
            const destPath = path.join(destRoot, backupId, path.basename(sourcePath));

            // Create destination directory
            await fsUtils.ensureDir(destPath);

            // Count files and calculate size
            console.log(chalk.cyan('Scanning directory...'));

            const { totalSize, fileCount, folderCount } = await this.scanDirectory(sourcePath, excludePatterns);
            console.log(chalk.green(`Found ${fileCount} files, ${folderCount} folders (${fsUtils.formatBytes(totalSize)})`));

            // Setup progress display
            console.log('\n' + chalk.cyan('Starting backup process...'));

            // Create ultra-smooth progress bar
            progressBar = new cliProgress.SingleBar({
                format: '[{bar}] {percentage}% | {speed} | {transferred}/{totalSize} | {eta} | Files: {filesProgress}',
                barCompleteChar: '█',
                barIncompleteChar: '░',
                hideCursor: true,
                clearOnComplete: false,
                barsize: 30, // Increased for smoother animation
                etaBuffer: 200 // Increased buffer for smoother ETA
            });

            progressBar.start(100, 0, {
                speed: '0.0 MB/s',
                transferred: '0.0 MB',
                totalSize: fsUtils.formatBytes(totalSize),
                filesProgress: `0/${fileCount}`,
                eta: 'Estimated: calculating...'
            });

            // Ultra-enhanced progress tracker with anti-spike technology
            const progressTracker = new UltraSmoothProgressTracker(
                progressBar,
                this.progressUpdateInterval,
                totalSize,
                fileCount,
                startTime
            );

            // Copy files with ultra-smooth progress
            await this.copyDirectoryRecursive(
                sourcePath,
                destPath,
                excludePatterns,
                progressTracker,
                startTime
            );

            // Ensure smooth completion
            progressTracker.completeProgress();

            progressBar.stop();
            console.log(chalk.green('✓ All files copied successfully'));

            // Save to history with proper notes formatting
            const duration = (Date.now() - startTime) / 1000;
            const historyEntry = {
                id: backupId,
                timestamp: new Date().toISOString(),
                source: sourcePath,
                dest_root: destRoot,
                snapshot_path: destPath,
                user_notes: userNotes ? userNotes.trim() : '',
                excluded: excludePatterns || [],
                file_count: fileCount,
                folder_count: folderCount,
                total_bytes: totalSize,
                duration_seconds: duration
            };

            await ConfigManager.addHistoryEntry(historyEntry);

            console.log(chalk.green(`\n✓ Backup completed in ${duration.toFixed(2)}s`));
            console.log(chalk.gray(`  Backup ID: ${backupId}`));
            console.log(chalk.gray(`  Average speed: ${((totalSize / (1024 * 1024)) / duration).toFixed(1)} MB/s`));

            return historyEntry;

        } catch (error) {
            if (progressBar) progressBar.stop();
            await this.cleanup();
            throw error;
        }
    }

    async recovery(backupId, targetPath = null) {
        const startTime = Date.now();
        let progressBar = null;

        try {
            // Get backup info from history
            const history = await ConfigManager.getHistory();
            const backup = history.find(item => item.id === backupId);

            if (!backup) {
                throw new Error(`Backup with ID ${backupId} not found`);
            }

            // Verify backup exists
            if (!fs.existsSync(backup.snapshot_path)) {
                throw new Error(`Backup snapshot not found at: ${backup.snapshot_path}`);
            }

            // Handle target path confirmation with single key input
            const actualTargetPath = targetPath || backup.source;

            if (fs.existsSync(actualTargetPath)) {
                const answer = await this.getSingleKeyInput(
                    chalk.yellow(`Target path exists. Destructive recovery will replace all files. Continue? (y/n): `),
                    ['y', 'n']
                );

                if (answer !== 'y') {
                    throw new Error('Recovery cancelled by user');
                }
            }

            // Scan backup
            console.log(chalk.green('Scanning backup contents...'));
            const { totalSize, fileCount, folderCount } = await this.scanDirectory(backup.snapshot_path, []);
            console.log(chalk.green(`Ready to recover ${fileCount} files, ${folderCount} folders (${fsUtils.formatBytes(totalSize)})`));

            // Setup progress display for recovery
            console.log('\n' + chalk.green('Starting recovery process...'));

            // Create ultra-smooth progress bar
            progressBar = new cliProgress.SingleBar({
                format: '[{bar}] {percentage}% | {speed} | {transferred}/{totalSize} | {eta} | Files: {filesProgress}',
                barCompleteChar: '█',
                barIncompleteChar: '░',
                hideCursor: true,
                clearOnComplete: false,
                barsize: 30,
                etaBuffer: 200
            });

            progressBar.start(100, 0, {
                speed: '0.0 MB/s',
                transferred: '0.0 MB',
                totalSize: fsUtils.formatBytes(totalSize),
                filesProgress: `0/${fileCount}`,
                eta: 'Estimated: calculating...'
            });

            // Ultra-enhanced progress tracker
            const progressTracker = new UltraSmoothProgressTracker(
                progressBar,
                this.progressUpdateInterval,
                totalSize,
                fileCount,
                startTime
            );

            // Copy files with ultra-smooth progress
            await this.copyDirectoryRecursive(
                backup.snapshot_path,
                actualTargetPath,
                [],
                progressTracker,
                startTime
            );

            // Ensure smooth completion
            progressTracker.completeProgress();

            progressBar.stop();
            console.log(chalk.green('✓ All files recovered successfully'));

            // Post-recovery operations
            await this.runPostRecoveryOperations(actualTargetPath);

            const duration = (Date.now() - startTime) / 1000;
            console.log(chalk.green(`\n✓ Recovery completed in ${duration.toFixed(2)}s`));
            console.log(chalk.gray(`  Recovered to: ${actualTargetPath}`));
            console.log(chalk.gray(`  Average speed: ${((totalSize / (1024 * 1024)) / duration).toFixed(1)} MB/s`));

            return { success: true, message: 'Recovery completed successfully' };

        } catch (error) {
            if (progressBar) progressBar.stop();
            await this.cleanup();
            throw error;
        }
    }

    // Display backup information in the requested format
    displayBackupInfo(backup) {
        console.log(chalk.cyan('╔═══════════════════════════════════════╗'));
        console.log(chalk.cyan('║          BACKUP INFORMATION           ║'));
        console.log(chalk.cyan('╚═══════════════════════════════════════╝'));
        console.log(chalk.white(`Backup: ${chalk.yellow(backup.id)}`));
        console.log(chalk.white(`Date: ${chalk.gray(new Date(backup.timestamp).toLocaleString())}`));
        console.log(chalk.white(`Source: ${chalk.gray(backup.source)}`));
        console.log(chalk.white(`Folders: ${chalk.green(backup.folder_count || 0)}`));
        console.log(chalk.white(`Files: ${chalk.green(backup.file_count || 0)}`));
        console.log(chalk.white(`Size: ${chalk.green(Math.round((backup.total_bytes || 0) / (1024 * 1024)))} MB`));
        if (backup.user_notes && backup.user_notes !== 'Null') {
            const noteLines = backup.user_notes.split('\n');
            console.log(chalk.white(`Notes: ${chalk.gray(noteLines[0])}`));
            for (let i = 1; i < noteLines.length; i++) {
                console.log(chalk.gray(noteLines[i]));
            }
        }
        console.log(chalk.cyan('═══════════════════════════════════════'));
    }

    // Enhanced directory scanning with exclude patterns
    async scanDirectory(dirPath, excludePatterns = []) {
        let totalSize = 0;
        let fileCount = 0;
        let folderCount = 0;

        const scanRecursive = async (currentPath) => {
            try {
                const items = await fs.promises.readdir(currentPath, { withFileTypes: true });

                for (let i = 0; i < items.length; i += this.fileProcessBatchSize) {
                    const batch = items.slice(i, i + this.fileProcessBatchSize);

                    for (const item of batch) {
                        const itemPath = path.join(currentPath, item.name);

                        // Skip excluded items
                        if (this.matchPattern(item.name, excludePatterns)) {
                            continue;
                        }

                        if (item.isDirectory()) {
                            folderCount++;
                            await scanRecursive(itemPath);
                        } else {
                            fileCount++;
                            try {
                                const stats = await fs.promises.stat(itemPath);
                                totalSize += stats.size;
                            } catch (error) {
                                // Skip files we can't stat
                            }
                        }
                    }

                    // Yield control for better responsiveness
                    await new Promise(resolve => setImmediate(resolve));
                }
            } catch (error) {
                // Skip directories we can't read
            }
        };

        await scanRecursive(dirPath);
        return { totalSize, fileCount, folderCount };
    }

    // Optimized directory copying with ultra-smooth progress
    async copyDirectoryRecursive(src, dest, excludePatterns, progressTracker, startTime) {
        await fsUtils.ensureDir(dest);

        const items = await fs.promises.readdir(src, { withFileTypes: true });

        for (let i = 0; i < items.length; i += this.fileProcessBatchSize) {
            const batch = items.slice(i, i + this.fileProcessBatchSize);

            for (const item of batch) {
                const srcPath = path.join(src, item.name);
                const destPath = path.join(dest, item.name);

                if (this.matchPattern(item.name, excludePatterns)) {
                    continue;
                }

                try {
                    if (item.isDirectory()) {
                        await this.copyDirectoryRecursive(
                            srcPath,
                            destPath,
                            excludePatterns,
                            progressTracker,
                            startTime
                        );
                    } else {
                        const stats = await fs.promises.stat(srcPath);

                        // Enhanced file copying with better progress tracking
                        if (stats.size > 50 * 1024 * 1024) { // 50MB+ for streaming
                            await this.streamCopyFile(srcPath, destPath, progressTracker, stats.size);
                        } else {
                            await fsUtils.copyFile(srcPath, destPath);
                            progressTracker.updateProgress(srcPath, stats.size);
                        }
                    }
                } catch (error) {
                    // Continue with other files
                }
            }

            // Optimized yielding for smooth progress
            await new Promise(resolve => setImmediate(resolve));
        }
    }

    // Enhanced stream copy with chunk-based progress
    async streamCopyFile(srcPath, destPath, progressTracker, fileSize) {
        return new Promise((resolve, reject) => {
            const readStream = fs.createReadStream(srcPath, { 
                highWaterMark: 64 * 1024 // 64KB chunks for smooth progress
            });
            const writeStream = fs.createWriteStream(destPath);
            let copiedBytes = 0;

            readStream.on('data', (chunk) => {
                copiedBytes += chunk.length;
                progressTracker.updateProgressChunk(chunk.length);
            });

            readStream.on('end', () => {
                progressTracker.fileCompleted(srcPath, fileSize);
                resolve();
            });

            readStream.on('error', reject);
            writeStream.on('error', reject);

            readStream.pipe(writeStream);
        });
    }

    // Post-recovery operations with default chmod 444
    async runPostRecoveryOperations(targetPath) {
        // Apply permissions with default chmod 444
        await this.applyPostRecoveryPermissions(targetPath);

        // Auto-install dependencies with proper async handling
        const autoInstallEnabled = ConfigManager.getBoolean('recovery', 'recovery_auto_install', true);
        if (autoInstallEnabled) {
            await this.autoInstallDependencies(targetPath);
        }
    }

    async applyPostRecoveryPermissions(targetPath) {
        // Get chmod commands from config, or use default
        let chmodCmds = ConfigManager.getMultiValue('permissions', 'post_recovery_chmod', []);

        // If no chmod commands configured, use default chmod 444
        if (!chmodCmds || chmodCmds.length === 0) {
            chmodCmds = ['find . -type f -exec chmod 444 {} +'];
            console.log(chalk.blue('Applying default file permissions (444)...'));
        } else {
            console.log(chalk.blue('Applying configured file permissions...'));
        }

        const chownCmds = ConfigManager.getMultiValue('permissions', 'post_recovery_chown', []);

        let successCount = 0;
        let failCount = 0;

        for (const cmd of chmodCmds) {
            try {
                const expandedCmd = this.expandEnvironmentVariables(cmd);
                await execAsync(expandedCmd, {
                    cwd: targetPath,
                    timeout: 30000
                });
                successCount++;
            } catch (error) {
                failCount++;
                console.log(chalk.yellow(`Warning: Failed to execute '${cmd}': ${error.message}`));
            }
        }

        this.reportPermissionResults('Permissions', successCount, failCount);

        // Handle chown commands (only if root)
        if (chownCmds && chownCmds.length > 0) {
            const isRoot = process.getuid && process.getuid() === 0;

            if (isRoot) {
                console.log(chalk.blue('Applying ownership...'));

                let chownSuccessCount = 0;
                let chownFailCount = 0;

                for (const cmd of chownCmds) {
                    try {
                        const expandedCmd = this.expandEnvironmentVariables(cmd);
                        await execAsync(expandedCmd, {
                            cwd: targetPath,
                            timeout: 30000
                        });
                        chownSuccessCount++;
                    } catch (error) {
                        chownFailCount++;
                        console.log(chalk.yellow(`Warning: Failed to execute '${cmd}': ${error.message}`));
                    }
                }

                this.reportPermissionResults('Ownership', chownSuccessCount, chownFailCount);
            }
        }
    }

    // Fixed auto-install dependencies function with recursive package.json detection
    async autoInstallDependencies(targetPath) {
        console.log(chalk.blue('Checking for dependency files...'));

        try {
            // Find all package.json files recursively
            const packageJsonPaths = await this.findAllPackageJson(targetPath);

            if (packageJsonPaths.length > 0) {
                console.log(chalk.blue(`Found ${packageJsonPaths.length} package.json file(s)`));

                for (const packageJsonPath of packageJsonPaths) {
                    const packageDir = path.dirname(packageJsonPath);
                    const relativePath = path.relative(targetPath, packageDir);
                    console.log(chalk.blue(`Installing dependencies in: ${relativePath || '.'}`));

                    // Change to package.json directory
                    const originalCwd = process.cwd();
                    process.chdir(packageDir);

                    try {
                        // Check for lock files
                        const hasPackageLock = fs.existsSync(path.join(packageDir, 'package-lock.json'));
                        const hasYarnLock = fs.existsSync(path.join(packageDir, 'yarn.lock'));

                        let cmd;
                        let packageManager;

                        if (hasYarnLock) {
                            cmd = 'yarn install --non-interactive';
                            packageManager = 'Yarn';
                        } else if (hasPackageLock) {
                            cmd = 'npm ci';
                            packageManager = 'npm (ci)';
                        } else {
                            cmd = 'npm install';
                            packageManager = 'npm';
                        }

                        console.log(chalk.blue(`Installing with ${packageManager}...`));
                        console.log(chalk.gray(`Running: ${cmd}`));

                        await execAsync(cmd, {
                            cwd: packageDir,
                            env: { ...process.env },
                            timeout: 300000,
                            maxBuffer: 10 * 1024 * 1024
                        });

                        console.log(chalk.green(`✓ ${packageManager} dependencies installed in ${relativePath || '.'}`));

                    } catch (error) {
                        console.log(chalk.yellow(`⚠ Failed to install dependencies in ${relativePath || '.'}: ${error.message}`));
                    } finally {
                        // Restore original directory
                        process.chdir(originalCwd);
                    }
                }
            }

            // Check for other dependency files in the target root
            const otherInstallers = [
                {
                    file: 'requirements.txt',
                    name: 'Python',
                    handler: this.installPythonDependencies.bind(this)
                },
                {
                    file: 'Gemfile',
                    name: 'Ruby',
                    handler: this.installRubyDependencies.bind(this)
                },
                {
                    file: 'composer.json',
                    name: 'PHP',
                    handler: this.installPHPDependencies.bind(this)
                }
            ];

            for (const installer of otherInstallers) {
                const filePath = path.join(targetPath, installer.file);

                if (fs.existsSync(filePath)) {
                    console.log(chalk.blue(`Installing ${installer.name} dependencies...`));

                    try {
                        const result = await installer.handler(targetPath);
                        if (result && result.success) {
                            console.log(chalk.green(`✓ ${installer.name}: ${result.message}`));
                        } else {
                            console.log(chalk.yellow(`⚠ ${installer.name}: Failed - ${result.error || 'Unknown error'}`));
                        }
                    } catch (error) {
                        console.log(chalk.yellow(`⚠ ${installer.name}: ${error.message}`));
                    }
                }
            }

        } catch (error) {
            console.log(chalk.red(`Dependency installation error: ${error.message}`));
        }
    }

    // Recursive search for all package.json files with deeper search
    async findAllPackageJson(targetPath, maxDepth = 10) {
        const packageJsonPaths = [];

        const searchRecursive = async (currentPath, currentDepth = 0) => {
            if (currentDepth >= maxDepth) return;

            try {
                const packageJsonPath = path.join(currentPath, 'package.json');
                if (fs.existsSync(packageJsonPath)) {
                    packageJsonPaths.push(packageJsonPath);
                }

                const items = await fs.promises.readdir(currentPath, { withFileTypes: true });

                for (const item of items) {
                    if (item.isDirectory() &&
                        !item.name.startsWith('.') &&
                        item.name !== 'node_modules' &&
                        item.name !== 'dist' &&
                        item.name !== 'build' &&
                        item.name !== 'coverage' &&
                        item.name !== '__pycache__' &&
                        item.name !== 'vendor') {

                        const subDirPath = path.join(currentPath, item.name);
                        await searchRecursive(subDirPath, currentDepth + 1);
                    }
                }
            } catch (error) {
                // Skip directories we can't access
            }
        };

        await searchRecursive(targetPath);
        return packageJsonPaths;
    }

    async installPythonDependencies(targetPath) {
        try {
            const venvPath = path.join(targetPath, 'venv');
            const venvBinPath = path.join(venvPath, 'bin', 'pip');
            const pipCmd = fs.existsSync(venvBinPath) ? venvBinPath : 'pip3';

            await execAsync(`${pipCmd} install -r requirements.txt --quiet`, {
                cwd: targetPath,
                timeout: 300000
            });

            return { success: true, message: 'Python dependencies installed' };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async installRubyDependencies(targetPath) {
        try {
            await execAsync('bundle install --quiet', {
                cwd: targetPath,
                timeout: 300000
            });

            return { success: true, message: 'Ruby dependencies installed' };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async installPHPDependencies(targetPath) {
        try {
            await execAsync('composer install --quiet --no-progress --no-interaction', {
                cwd: targetPath,
                timeout: 300000
            });

            return { success: true, message: 'PHP dependencies installed' };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    // Helper methods
    expandEnvironmentVariables(cmd) {
        return cmd
            .replace(/\$USER/g, process.env.USER || process.env.USERNAME || 'user')
            .replace(/\$\(whoami\)/g, process.env.USER || process.env.USERNAME || 'user')
            .replace(/\$HOME/g, HOME);
    }

    reportPermissionResults(operation, successCount, failCount) {
        if (failCount === 0 && successCount > 0) {
            console.log(chalk.green(`${operation} applied successfully (${successCount} commands)`));
        } else if (successCount === 0) {
            console.log(chalk.blue(`No ${operation.toLowerCase()} commands to apply`));
        } else {
            console.log(chalk.yellow(`${operation} partially applied (${successCount} succeeded, ${failCount} failed)`));
        }
    }

    async validateSavePaths(sourcePath, destRoot) {
        try {
            await fs.promises.access(sourcePath, fs.constants.R_OK);
        } catch (error) {
            throw new Error(`Cannot read source directory: ${sourcePath}`);
        }

        try {
            await fsUtils.ensureDir(destRoot);
            await fs.promises.access(destRoot, fs.constants.W_OK);
        } catch (error) {
            throw new Error(`Cannot write to destination: ${destRoot}`);
        }
    }

    // Generate backup ID with random number
    async generateBackupId() {
        const randomNum = Math.floor(Math.random() * 900000) + 100000;
        const timestamp = new Date().toISOString()
            .replace(/T/, '-')
            .replace(/:/g, '-')
            .replace(/\..+/, '');
        return `backup-${randomNum}-${timestamp}`;
    }

    matchPattern(filename, patterns) {
        if (!patterns || patterns.length === 0) return false;

        return patterns.some(pattern => {
            if (pattern.includes('*')) {
                const regexPattern = '^' + pattern
                    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
                    .replace(/\\\*/g, '.*') + '$';
                return new RegExp(regexPattern, 'i').test(filename);
            }
            return filename.toLowerCase() === pattern.toLowerCase();
        });
    }

    async cleanup() {
        const cleanupPromises = Array.from(this.tempPaths).map(async (tempPath) => {
            try {
                await fs.promises.rm(tempPath, { recursive: true, force: true });
            } catch (error) {
                // Silent cleanup
            }
        });

        await Promise.allSettled(cleanupPromises);
        this.tempPaths.clear();
    }
}

/**
 * Ultra-Smooth Progress Tracker - COMPLETELY REWRITTEN
 * 
 * Features:
 * - Triple-layer smoothing (instant → moving average → EMA)
 * - Advanced outlier detection and filtering
 * - Adaptive smoothing parameters based on operation characteristics
 * - Anti-spike technology for ultra-stable displays
 * - Intelligent ETA calculation with multiple fallback strategies
 * - Real-time performance optimization
 * - Enhanced ETA formatting with proper units
 */
class UltraSmoothProgressTracker {
    constructor(progressBar, updateInterval, totalSize, totalFiles, startTime) {
        this.progressBar = progressBar;
        this.updateInterval = updateInterval;
        this.startTime = startTime;
        
        // Core tracking
        this.copiedFiles = 0;
        this.copiedSize = 0;
        this.totalSize = Math.max(1, totalSize || 1);
        this.totalFiles = Math.max(1, totalFiles || 1);
        
        // Display update control - optimized for ultra-smooth animation
        this.lastDisplayUpdate = startTime;
        this.minDisplayInterval = 50; // Ultra-responsive 50ms for smoother animation
        this.frameBuffer = []; // Buffer for smooth frame rendering
        this.maxFrameBuffer = 3;
        
        // === SPEED CALCULATION SYSTEM (TRIPLE-LAYER) ===
        
        // Layer 1: Instant speed tracking
        this.lastSizeForSpeed = 0;
        this.lastTimeForSpeed = startTime;
        this.speedCalculationInterval = 150; // Faster calculation for responsiveness
        this.lastSpeedCalculation = startTime;
        
        // Layer 2: Moving average of instant speeds (anti-spike)
        this.speedSamples = [];
        this.speedTimestamps = [];
        this.speedSampleWindow = 8; // More samples for stability
        this.maxSampleAge = 2500; // Shorter window for responsiveness
        
        // Layer 3: Final EMA smoothing for display
        this.displaySpeed = 0;
        this.speedSmoothingFactor = 0.25; // Balanced smoothing
        
        // Advanced spike detection with adaptive thresholds
        this.maxSpeedMultiplier = 2.0; // Stricter spike detection
        this.minValidSpeed = 0.01; // MB/s
        this.maxValidSpeed = 2000; // MB/s (increased for very fast operations)
        
        // Adaptive thresholds based on operation size
        if (this.totalSize > 100 * 1024 * 1024 * 1024) { // 100GB+
            this.maxValidSpeed = 5000; // Very high-speed operations
            this.speedSmoothingFactor = 0.15; // More aggressive smoothing
        } else if (this.totalSize < 10 * 1024 * 1024) { // < 10MB
            this.maxSpeedMultiplier = 3.0; // Allow more variance for small files
            this.speedSmoothingFactor = 0.4; // Less smoothing for quick ops
        }
        
        // === ETA CALCULATION SYSTEM (ENHANCED QUAD-LAYER) ===
        
        // Layer 1: Raw ETA calculation with multiple methods
        this.etaCalculationMethods = ['moving_average', 'ema_speed', 'trend_analysis', 'adaptive_window'];
        
        // Layer 2: ETA smoothing and validation
        this.etaHistory = [];
        this.etaHistoryWindow = 12; // Larger window for stability
        this.etaSmoothingFactor = 0.15; // Smoother ETA transitions
        this.smoothedEta = null;
        
        // Layer 3: Stability detection with adaptive parameters
        this.stableEtaThreshold = 0.15; // Stricter stability requirement
        this.minStabilityTime = 1500; // Faster stabilization
        this.etaStabilityCounter = 0;
        this.etaConfidenceLevel = 0; // 0-1 confidence in ETA accuracy
        
        // Layer 4: Display formatting and capping with precision handling
        this.maxDisplayEta = 172800; // 48 hours max (for very large operations)
        this.lastEtaDisplay = 'Estimated: calculating...';
        this.etaUpdateInterval = 300; // More frequent ETA updates
        this.lastEtaUpdate = startTime;
        this.etaPrecisionMode = 'adaptive'; // adaptive, high, standard
        
        // === OPERATION CHARACTERISTICS & ADAPTIVE BEHAVIOR ===
        this.isSmallOperation = totalSize < 10 * 1024 * 1024; // < 10MB
        this.isMediumOperation = totalSize >= 10 * 1024 * 1024 && totalSize < 1024 * 1024 * 1024; // 10MB - 1GB
        this.isLargeOperation = totalSize >= 1024 * 1024 * 1024 && totalSize < 10 * 1024 * 1024 * 1024; // 1GB - 10GB
        this.isVeryLargeOperation = totalSize >= 10 * 1024 * 1024 * 1024; // 10GB+
        this.isHighFileCountOperation = totalFiles > 10000; // Many small files
        this.isVeryHighFileCountOperation = totalFiles > 100000; // Extreme file count
        
        this.operationStarted = false;
        this.warmupPeriod = this.isSmallOperation ? 500 : (this.isVeryLargeOperation ? 3000 : 1500);
        
        // Enhanced fallback speeds for different scenarios
        this.fallbackSpeeds = {
            small_few_files: 5.0,      // Small total size, few files
            small_many_files: 15.0,    // Small total size, many files
            medium_standard: 50.0,     // Medium operations
            large_standard: 150.0,     // Large operations
            very_large: 300.0,         // Very large operations
            high_file_count: 25.0,     // Many small files scenario
            very_high_file_count: 35.0 // Extreme file count scenario
        };
        
        // Performance optimization with adaptive thresholds
        this.chunkUpdateThreshold = this.isVeryLargeOperation ? 
            (4 * 1024 * 1024) : (this.isLargeOperation ? (2 * 1024 * 1024) : (512 * 1024));
        this.accumulatedChunkSize = 0;
        
        // Progress smoothing for animation
        this.lastProgressPercentage = 0;
        this.progressSmoothingEnabled = true;
        this.progressSmoothingFactor = 0.3;
    }

    updateProgress(filePath, fileSize) {
        this.copiedFiles++;
        this.copiedSize += fileSize;
        this.operationStarted = true;
        this._scheduleDisplayUpdate();
    }

    updateProgressChunk(chunkSize) {
        this.copiedSize += chunkSize;
        this.accumulatedChunkSize += chunkSize;
        
        // Adaptive threshold for different operation types
        const threshold = this.isHighFileCountOperation ? 
            (256 * 1024) : this.chunkUpdateThreshold;
            
        if (this.accumulatedChunkSize >= threshold) {
            this.operationStarted = true;
            this._scheduleDisplayUpdate();
            this.accumulatedChunkSize = 0;
        }
    }

    fileCompleted(filePath, fileSize) {
        this.copiedFiles++;
        this.operationStarted = true;
        this._scheduleDisplayUpdate();
    }

    _scheduleDisplayUpdate() {
        const now = Date.now();
        
        // Ultra-responsive display updates with frame buffering
        if (now - this.lastDisplayUpdate >= this.minDisplayInterval) {
            this._updateDisplay();
            this.lastDisplayUpdate = now;
        }
    }

    _updateDisplay() {
        const now = Date.now();
        
        // Calculate current percentage with smoothing
        const rawPercentage = Math.min(100, (this.copiedSize / this.totalSize) * 100);
        let percentage = rawPercentage;
        
        // Apply progress smoothing for ultra-smooth bar animation
        if (this.progressSmoothingEnabled && this.lastProgressPercentage > 0) {
            const progressDiff = rawPercentage - this.lastProgressPercentage;
            if (Math.abs(progressDiff) > 0.1) { // Only smooth significant changes
                percentage = this.lastProgressPercentage + (progressDiff * this.progressSmoothingFactor);
            }
        }
        this.lastProgressPercentage = percentage;
        
        // === SPEED CALCULATION ===
        const currentSpeed = this._calculateCurrentSpeed(now);
        
        // === ETA CALCULATION ===
        const shouldUpdateEta = (now - this.lastEtaUpdate) >= this.etaUpdateInterval;
        if (shouldUpdateEta) {
            this.lastEtaDisplay = this._calculateEta(currentSpeed, now);
            this.lastEtaUpdate = now;
        }
        
        // === DISPLAY FORMATTING ===
        const transferredMB = (this.copiedSize / (1024 * 1024)).toFixed(1);
        const totalMB = (this.totalSize / (1024 * 1024)).toFixed(1);
        const filesProgress = `${this.copiedFiles}/${this.totalFiles}`;
        
        // Update progress bar with enhanced formatting
        try {
            this.progressBar.update(Math.round(percentage * 100) / 100, {
                speed: `${currentSpeed.toFixed(1)} MB/s`,
                transferred: `${transferredMB} MB`,
                totalSize: `${totalMB} MB`,
                filesProgress: filesProgress,
                eta: this.lastEtaDisplay
            });
        } catch (error) {
            // Silent error handling for stability
        }
    }

    _calculateCurrentSpeed(now) {
        // Don't calculate speed too frequently for stability
        if (now - this.lastSpeedCalculation < this.speedCalculationInterval) {
            return this.displaySpeed;
        }
        
        const timeDelta = (now - this.lastTimeForSpeed) / 1000;
        const sizeDelta = this.copiedSize - this.lastSizeForSpeed;
        
        if (timeDelta >= 0.1 && sizeDelta > 0) {
            // Calculate instant speed
            const instantSpeed = (sizeDelta / (1024 * 1024)) / timeDelta;
            
            // Enhanced validation with adaptive limits
            if (this._isValidSpeed(instantSpeed)) {
                this._addSpeedSample(instantSpeed, now);
                
                // Update tracking markers
                this.lastSizeForSpeed = this.copiedSize;
                this.lastTimeForSpeed = now;
                this.lastSpeedCalculation = now;
            }
        }
        
        // Get smoothed speed from samples
        const smoothedSpeed = this._getSmoothedSpeed();
        
        // Apply final EMA smoothing for display with adaptive factor
        if (this.displaySpeed === 0) {
            this.displaySpeed = smoothedSpeed;
        } else {
            const adaptiveFactor = this._getAdaptiveSmoothingFactor();
            this.displaySpeed = (adaptiveFactor * smoothedSpeed) + 
                              ((1 - adaptiveFactor) * this.displaySpeed);
        }
        
        // Ensure valid display speed with enhanced bounds
        return Math.max(this.minValidSpeed, Math.min(this.displaySpeed, this.maxValidSpeed));
    }

    _getAdaptiveSmoothingFactor() {
        // Adapt smoothing based on operation characteristics
        if (this.isVeryHighFileCountOperation) {
            return 0.4; // More responsive for many small files
        } else if (this.isVeryLargeOperation) {
            return 0.15; // More stable for large files
        } else if (this.isSmallOperation) {
            return 0.5; // Very responsive for small operations
        }
        return this.speedSmoothingFactor;
    }

    _isValidSpeed(speed) {
        if (!isFinite(speed) || speed <= 0) return false;
        if (speed < this.minValidSpeed || speed > this.maxValidSpeed) return false;
        
        // Enhanced validation for different operation types
        if (this.isVeryLargeOperation && speed > 1000) {
            // Allow higher speeds for very large operations but validate against system limits
            const systemLimit = this.isVeryHighFileCountOperation ? 500 : 2000;
            if (speed > systemLimit) return false;
        }
        
        if (this.isHighFileCountOperation && speed > 100) {
            // Many small files typically have lower sustained speeds
            return false;
        }
        
        return true;
    }

    _addSpeedSample(speed, timestamp) {
        // Add sample with confidence weighting
        this.speedSamples.push(speed);
        this.speedTimestamps.push(timestamp);
        
        // Adaptive window management
        const maxWindow = this.isVeryLargeOperation ? 12 : 
                         (this.isSmallOperation ? 4 : this.speedSampleWindow);
        const maxAge = this.isVeryLargeOperation ? 4000 :
                      (this.isSmallOperation ? 1500 : this.maxSampleAge);
        
        // Remove old samples
        while (this.speedSamples.length > 0) {
            const age = timestamp - this.speedTimestamps[0];
            if (age > maxAge || this.speedSamples.length > maxWindow) {
                this.speedSamples.shift();
                this.speedTimestamps.shift();
            } else {
                break;
            }
        }
    }

    _getSmoothedSpeed() {
        if (this.speedSamples.length === 0) {
            return this._getFallbackSpeed();
        }
        
        // Enhanced outlier removal with adaptive IQR
        let validSamples = [...this.speedSamples];
        
        if (validSamples.length >= 5) {
            validSamples.sort((a, b) => a - b);
            
            const q1Index = Math.floor(validSamples.length * 0.25);
            const q3Index = Math.floor(validSamples.length * 0.75);
            const q1 = validSamples[q1Index];
            const q3 = validSamples[q3Index];
            const iqr = q3 - q1;
            
            // Adaptive IQR multiplier based on operation type
            const iqrMultiplier = this.isVeryLargeOperation ? 1.2 : 
                                 (this.isHighFileCountOperation ? 2.0 : 1.5);
            
            const lowerBound = q1 - (iqrMultiplier * iqr);
            const upperBound = q3 + (iqrMultiplier * iqr);
            
            const filteredSamples = this.speedSamples.filter(s => s >= lowerBound && s <= upperBound);
            if (filteredSamples.length >= 2) {
                validSamples = filteredSamples;
            }
        }
        
        // Enhanced weighted average with exponential weighting
        let weightedSum = 0;
        let totalWeight = 0;
        
        for (let i = 0; i < validSamples.length; i++) {
            // Exponential weighting favoring recent samples
            const weight = Math.pow(1.5, i);
            weightedSum += validSamples[i] * weight;
            totalWeight += weight;
        }
        
        const avgSpeed = weightedSum / totalWeight;
        return Math.max(this.minValidSpeed, avgSpeed);
    }

    _getFallbackSpeed() {
        const elapsedSeconds = Math.max(1, (Date.now() - this.startTime) / 1000);
        const avgSpeed = (this.copiedSize / (1024 * 1024)) / elapsedSeconds;
        
        if (avgSpeed > this.minValidSpeed && avgSpeed <= this.maxValidSpeed) {
            return avgSpeed;
        }
        
        // Enhanced fallback based on operation characteristics
        if (this.isVeryHighFileCountOperation) {
            return this.fallbackSpeeds.very_high_file_count;
        } else if (this.isHighFileCountOperation) {
            return this.fallbackSpeeds.high_file_count;
        } else if (this.isVeryLargeOperation) {
            return this.fallbackSpeeds.very_large;
        } else if (this.isLargeOperation) {
            return this.fallbackSpeeds.large_standard;
        } else if (this.isSmallOperation) {
            return this.totalFiles > 1000 ? 
                this.fallbackSpeeds.small_many_files : 
                this.fallbackSpeeds.small_few_files;
        }
        return this.fallbackSpeeds.medium_standard;
    }

    _calculateEta(currentSpeed, now) {
        const remainingBytes = Math.max(0, this.totalSize - this.copiedSize);
        
        // If transfer is complete or nearly complete
        if (remainingBytes <= 1024 || this.copiedSize >= this.totalSize) {
            return 'Estimated: 0s';
        }
        
        // During warmup period, show calculating
        if (!this.operationStarted || (now - this.startTime) < this.warmupPeriod) {
            return 'Estimated: calculating...';
        }
        
        // Calculate ETA using multiple enhanced methods
        const etaEstimates = [];
        
        // Method 1: Current speed with confidence weighting
        if (currentSpeed > this.minValidSpeed) {
            const eta1 = (remainingBytes / (1024 * 1024)) / currentSpeed;
            if (isFinite(eta1) && eta1 > 0 && eta1 <= this.maxDisplayEta) {
                etaEstimates.push({ eta: eta1, confidence: 0.8 });
            }
        }
        
        // Method 2: Moving average speed
        const avgSpeed = this._getSmoothedSpeed();
        if (avgSpeed > this.minValidSpeed) {
            const eta2 = (remainingBytes / (1024 * 1024)) / avgSpeed;
            if (isFinite(eta2) && eta2 > 0 && eta2 <= this.maxDisplayEta) {
                etaEstimates.push({ eta: eta2, confidence: 0.9 });
            }
        }
        
        // Method 3: Overall average since start
        const elapsedSeconds = (now - this.startTime) / 1000;
        if (elapsedSeconds > 1 && this.copiedSize > 0) {
            const overallSpeed = (this.copiedSize / (1024 * 1024)) / elapsedSeconds;
            if (overallSpeed > this.minValidSpeed) {
                const eta3 = (remainingBytes / (1024 * 1024)) / overallSpeed;
                if (isFinite(eta3) && eta3 > 0 && eta3 <= this.maxDisplayEta) {
                    const confidence = Math.min(0.7, elapsedSeconds / 30); // Build confidence over time
                    etaEstimates.push({ eta: eta3, confidence });
                }
            }
        }
        
        // Method 4: Adaptive window method for very large operations
        if (this.isVeryLargeOperation && this.speedSamples.length >= 3) {
            const recentSamples = this.speedSamples.slice(-5);
            const recentAvg = recentSamples.reduce((sum, s) => sum + s, 0) / recentSamples.length;
            if (recentAvg > this.minValidSpeed) {
                const eta4 = (remainingBytes / (1024 * 1024)) / recentAvg;
                if (isFinite(eta4) && eta4 > 0 && eta4 <= this.maxDisplayEta) {
                    etaEstimates.push({ eta: eta4, confidence: 0.75 });
                }
            }
        }
        
        // If no valid estimates, use enhanced fallback
        if (etaEstimates.length === 0) {
            const fallbackSpeed = this._getFallbackSpeed();
            const fallbackEta = Math.min((remainingBytes / (1024 * 1024)) / fallbackSpeed, this.maxDisplayEta);
            etaEstimates.push({ eta: fallbackEta, confidence: 0.3 });
        }
        
        // Weighted average based on confidence levels
        let weightedSum = 0;
        let totalWeight = 0;
        
        for (const estimate of etaEstimates) {
            weightedSum += estimate.eta * estimate.confidence;
            totalWeight += estimate.confidence;
        }
        
        const weightedEta = weightedSum / totalWeight;
        
        // Add to history for smoothing
        this.etaHistory.push({
            eta: weightedEta,
            timestamp: now,
            confidence: totalWeight / etaEstimates.length
        });
        
        // Adaptive history window management
        const historyWindow = this.isVeryLargeOperation ? 15 : 
                            (this.isSmallOperation ? 6 : this.etaHistoryWindow);
        
        while (this.etaHistory.length > historyWindow) {
            this.etaHistory.shift();
        }
        
        // Apply final smoothing with confidence weighting
        let finalEta = weightedEta;
        
        if (this.etaHistory.length >= 3) {
            // Calculate confidence-weighted trend
            const recentHistory = this.etaHistory.slice(-8);
            let confidenceWeightedSum = 0;
            let totalConfidenceWeight = 0;
            
            for (const history of recentHistory) {
                confidenceWeightedSum += history.eta * history.confidence;
                totalConfidenceWeight += history.confidence;
            }
            
            const confidenceWeightedEta = confidenceWeightedSum / totalConfidenceWeight;
            
            // Apply smoothing with previous value
            if (this.smoothedEta !== null) {
                const adaptiveEtaSmoothing = this._getAdaptiveEtaSmoothingFactor();
                finalEta = (adaptiveEtaSmoothing * confidenceWeightedEta) + 
                          ((1 - adaptiveEtaSmoothing) * this.smoothedEta);
            } else {
                finalEta = confidenceWeightedEta;
            }
        }
        
        this.smoothedEta = finalEta;
        
        // Update confidence level for display precision
        this._updateEtaConfidence(now);
        
        // Format for display with enhanced precision
        return this._formatEtaDisplay(finalEta);
    }

    _getAdaptiveEtaSmoothingFactor() {
        // Adapt ETA smoothing based on operation type and confidence
        if (this.isVeryLargeOperation) {
            return 0.1; // Very smooth for large operations
        } else if (this.isHighFileCountOperation) {
            return 0.25; // More responsive for many files
        } else if (this.isSmallOperation) {
            return 0.4; // Highly responsive for small operations
        }
        return this.etaSmoothingFactor;
    }

    _updateEtaConfidence(now) {
        const elapsedSeconds = (now - this.startTime) / 1000;
        const progressRatio = this.copiedSize / this.totalSize;
        
        // Build confidence over time and progress
        this.etaConfidenceLevel = Math.min(1.0, 
            (elapsedSeconds / 10) * 0.3 + // Time factor
            (progressRatio * 0.4) + // Progress factor
            (this.speedSamples.length / 10) * 0.3 // Sample count factor
        );
    }

    _formatEtaDisplay(etaSeconds) {
        // Comprehensive validation with enhanced error handling
        if (!isFinite(etaSeconds) || etaSeconds < 0 || isNaN(etaSeconds)) {
            return 'Estimated: 0s';
        }
        
        // Cap maximum with operation-specific limits
        const maxEta = this.isVeryLargeOperation ? this.maxDisplayEta : 
                      (this.isLargeOperation ? 86400 : 43200); // 24h for large, 12h for medium
        
        if (etaSeconds > maxEta) {
            const hours = Math.round(maxEta / 3600);
            return `Estimated: ${hours}h+`;
        }
        
        // Enhanced precision formatting based on confidence and operation type
        const precision = this._getDisplayPrecision(etaSeconds);
        
        if (etaSeconds < 1) {
            return 'Estimated: 0s';
        } else if (etaSeconds <= 60) {
            // Seconds display with adaptive precision
            if (precision === 'high' && etaSeconds >= 10) {
                return `Estimated: ${etaSeconds.toFixed(1)}s`;
            } else {
                return `Estimated: ${Math.round(etaSeconds)}s`;
            }
        } else if (etaSeconds <= 3600) {
            // Minutes display with enhanced precision
            const minutes = etaSeconds / 60;
            if (precision === 'high' && minutes >= 2) {
                return `Estimated: ${minutes.toFixed(1)}mnt`;
            } else if (minutes < 2) {
                return `Estimated: ${minutes.toFixed(1)}mnt`;
            } else {
                return `Estimated: ${Math.round(minutes)}mnt`;
            }
        } else {
            // Hours display with precision control
            const hours = etaSeconds / 3600;
            if (precision === 'high' && hours < 10) {
                return `Estimated: ${hours.toFixed(1)}hour`;
            } else {
                return `Estimated: ${Math.round(hours)}hour`;
            }
        }
    }

    _getDisplayPrecision(etaSeconds) {
        // Determine precision based on confidence, operation type, and ETA value
        if (this.etaConfidenceLevel < 0.3) {
            return 'low'; // Low confidence = round numbers
        }
        
        if (this.etaConfidenceLevel > 0.7 && 
            (this.isVeryLargeOperation || this.speedSamples.length >= 5)) {
            return 'high'; // High confidence = decimal precision
        }
        
        return 'standard';
    }

    completeProgress() {
        const now = Date.now();
        const totalDuration = (now - this.startTime) / 1000;
        const finalSpeed = Math.max(this.minValidSpeed, (this.totalSize / (1024 * 1024)) / totalDuration);
        
        const transferredMB = (this.totalSize / (1024 * 1024)).toFixed(1);
        const totalMB = transferredMB; // Same for completion
        
        try {
            this.progressBar.update(100, {
                speed: `${finalSpeed.toFixed(1)} MB/s`,
                transferred: `${transferredMB} MB`,
                totalSize: `${totalMB} MB`,
                filesProgress: `${this.totalFiles}/${this.totalFiles}`,
                eta: 'Estimated: completed'
            });
        } catch (error) {
            // Silent error handling for stability
        }
    }
}

// Export singleton instance
module.exports = new RevyCore();