/**
 * ConfigManager.js
 * Configuration management for Revy (User-space version)
 * Dynamically loads from user's home directory
 */

const os = require('os');
const path = require('path');
const HOME = os.homedir();

// Dynamic path resolution
const REVY_HOME = process.env.REVY_HOME || path.join(HOME, '.revy');
const REVY_CONFIG = process.env.REVY_CONFIG || path.join(REVY_HOME, 'config');
const REVY_DATA = process.env.REVY_DATA || path.join(HOME, '.local', 'share', 'revy');

const DespendentionImport = require(path.join(process.env.REVY_LIB || path.join(REVY_HOME, 'lib'), 'DespendentionImport.js'));
const { fs, chalk, fsUtils } = DespendentionImport;

const CONFIG_PATH = path.join(REVY_CONFIG, 'revy.conf');
const HISTORY_PATH = path.join(REVY_DATA, 'history.json');

class ConfigManager {
    constructor() {
        this.config = {};
        this.defaultConfig = {
            save: {
                source: path.join(HOME, 'Projects'),
                destination: path.join(HOME, 'Backups'),
                excluded: 'node_modules,.cache,*.tmp,*.log,.git,__pycache__,dist,build,.DS_Store,Thumbs.db'
            },
            recovery: {
                snapshot_root: path.join(HOME, 'Backups'),
                default_target: path.join(HOME, 'Projects'),
                recovery_auto_install: 'true',
                show_destructive_preview: 'true'
            },
            permissions: {
                post_recovery_chmod: [
                    'find . -type f -name "*.sh" -exec chmod 755 {} +',
                    'find . -type f -name "*.js" -exec chmod 644 {} +',
                    'find . -type f -name "*.json" -exec chmod 644 {} +',
                    'find . -type d -exec chmod 755 {} +'
                ],
                post_recovery_chown: `chown -R ${process.env.USER || 'user'}:${process.env.USER || 'user'} .`,
                restore_permissions: 'true'
            },
            meta: {
                history_file: HISTORY_PATH,
                max_history_entries: '100',
                enable_checksums: 'false'
            },
            ui: {
                progress_style: 'bar',
                spinner_style: 'dots',
                color_output: 'true',
                single_key_navigation: 'true'
            },
            advanced: {
                atomic_operations: 'true',
                temp_suffix: '_revy_tmp_',
                parallel_copy_workers: '4',
                verify_after_copy: 'true',
                min_free_space_percent: '10'
            }
        };
    }

    async init() {
        try {
            await this.ensureConfigExists();
            await this.loadConfig();
            await this.ensureHistoryExists();
        } catch (error) {
            console.error(chalk.red('Failed to initialize configuration:'), error.message);
            throw error;
        }
    }

    async ensureConfigExists() {
        try {
            await fs.promises.access(CONFIG_PATH);
        } catch {
            console.log(chalk.yellow('Creating default configuration file...'));
            await this.createDefaultConfig();
        }
    }

    async createDefaultConfig() {
        const configContent = this.generateConfigContent();
        
        await fsUtils.ensureDir(REVY_CONFIG);
        await fs.promises.writeFile(CONFIG_PATH, configContent, 'utf8');
        console.log(chalk.green(`✓ Configuration created at ${CONFIG_PATH}`));
    }

    generateConfigContent() {
        let content = '# Revy Configuration File\n';
        content += `# Location: ${CONFIG_PATH}\n`;
        content += '# This file supports multiple values for permission commands\n\n';

        for (const [section, options] of Object.entries(this.defaultConfig)) {
            content += `[${section}]\n`;
            for (const [key, value] of Object.entries(options)) {
                if (key === 'excluded') {
                    content += '# Excluded patterns (comma separated, glob patterns supported)\n';
                } else if (key === 'recovery_auto_install') {
                    content += '# Auto-install dependencies after recovery (npm install, etc.)\n';
                } else if (key === 'show_destructive_preview') {
                    content += '# Show file diff before destructive recovery\n';
                } else if (key === 'post_recovery_chmod') {
                    content += '# File permission commands (multiple entries supported)\n';
                } else if (key === 'post_recovery_chown') {
                    content += '# Ownership commands (use $USER for current user)\n';
                }
                
                if (Array.isArray(value)) {
                    // Write multiple entries for array values
                    for (const item of value) {
                        content += `${key}=${item}\n`;
                    }
                } else {
                    content += `${key}=${value}\n`;
                }
            }
            content += '\n';
        }

        return content;
    }

    async loadConfig() {
        try {
            const configContent = await fs.promises.readFile(CONFIG_PATH, 'utf8');
            this.config = this.parseConfig(configContent);
            
            // Expand environment variables in paths
            this.expandEnvVariables();
        } catch (error) {
            console.error(chalk.red('Failed to load configuration:'), error.message);
            this.config = this.defaultConfig;
        }
    }

    parseConfig(content) {
        const config = {};
        let currentSection = null;

        const lines = content.split('\n');
        for (const line of lines) {
            const trimmed = line.trim();
            
            if (!trimmed || trimmed.startsWith('#')) continue;
            
            if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
                currentSection = trimmed.slice(1, -1);
                config[currentSection] = {};
                continue;
            }
            
            if (currentSection && trimmed.includes('=')) {
                const [key, ...valueParts] = trimmed.split('=');
                const trimmedKey = key.trim();
                const value = valueParts.join('=').trim();
                
                // Handle multiple values for the same key
                if (config[currentSection].hasOwnProperty(trimmedKey)) {
                    // Convert to array if not already
                    if (!Array.isArray(config[currentSection][trimmedKey])) {
                        config[currentSection][trimmedKey] = [config[currentSection][trimmedKey]];
                    }
                    config[currentSection][trimmedKey].push(value);
                } else {
                    config[currentSection][trimmedKey] = value;
                }
            }
        }

        return config;
    }

    expandEnvVariables() {
        // Expand $USER, $HOME, etc. in config values
        const expandValue = (value) => {
            if (typeof value === 'string') {
                return value
                    .replace(/\$USER/g, process.env.USER || 'user')
                    .replace(/\$HOME/g, HOME)
                    .replace(/\$\(whoami\)/g, process.env.USER || 'user');
            } else if (Array.isArray(value)) {
                return value.map(expandValue);
            }
            return value;
        };

        for (const section in this.config) {
            for (const key in this.config[section]) {
                this.config[section][key] = expandValue(this.config[section][key]);
            }
        }
    }

    get(section, key, defaultValue = null) {
        try {
            const value = this.config[section]?.[key];
            if (value !== undefined) return value;
            
            const defaultVal = this.defaultConfig[section]?.[key];
            if (defaultVal !== undefined) return defaultVal;
            
            return defaultValue;
        } catch {
            return defaultValue;
        }
    }

    getBoolean(section, key, defaultValue = false) {
        const value = this.get(section, key, defaultValue.toString());
        if (Array.isArray(value)) {
            return value[0] === 'true' || value[0] === '1' || value[0] === 'yes';
        }
        return value === 'true' || value === '1' || value === 'yes';
    }

    getNumber(section, key, defaultValue = 0) {
        const value = this.get(section, key, defaultValue.toString());
        const strValue = Array.isArray(value) ? value[0] : value;
        const num = parseInt(strValue, 10);
        return isNaN(num) ? defaultValue : num;
    }

    getArray(section, key, separator = ',', defaultValue = []) {
        const value = this.get(section, key);
        if (!value) return defaultValue;
        
        // If already an array (multi-value from config), return it
        if (Array.isArray(value)) {
            // If it's an array of comma-separated values, split them
            if (separator === ',') {
                const result = [];
                for (const item of value) {
                    result.push(...item.split(separator).map(s => s.trim()).filter(s => s));
                }
                return result;
            }
            return value;
        }
        
        // Otherwise split the string value
        return value.split(separator).map(item => item.trim()).filter(item => item);
    }

    getMultiValue(section, key, defaultValue = []) {
        const value = this.get(section, key);
        if (!value) return defaultValue;
        return Array.isArray(value) ? value : [value];
    }

    async set(section, key, value) {
        if (!this.config[section]) {
            this.config[section] = {};
        }
        this.config[section][key] = value;
        await this.saveConfig();
    }

    async saveConfig() {
        const configContent = this.generateConfigFromCurrent();
        await fs.promises.writeFile(CONFIG_PATH, configContent, 'utf8');
    }

    generateConfigFromCurrent() {
        let content = '# Revy Configuration File\n';
        content += `# Location: ${CONFIG_PATH}\n\n`;

        for (const [section, options] of Object.entries(this.config)) {
            content += `[${section}]\n`;
            for (const [key, value] of Object.entries(options)) {
                if (Array.isArray(value)) {
                    for (const item of value) {
                        content += `${key}=${item}\n`;
                    }
                } else {
                    content += `${key}=${value}\n`;
                }
            }
            content += '\n';
        }

        return content;
    }

    async ensureHistoryExists() {
        const historyFile = this.get('meta', 'history_file', HISTORY_PATH);
        try {
            await fs.promises.access(historyFile);
        } catch {
            console.log(chalk.yellow('Creating history file...'));
            await this.createEmptyHistory();
        }
    }

    async createEmptyHistory() {
        const historyFile = this.get('meta', 'history_file', HISTORY_PATH);
        const historyDir = path.dirname(historyFile);
        
        await fsUtils.ensureDir(historyDir);
        await fs.promises.writeFile(historyFile, JSON.stringify([], null, 2));
        console.log(chalk.green(`✓ History file created at ${historyFile}`));
    }
    
    async getHistory() {
        const historyFile = this.get('meta', 'history_file', HISTORY_PATH);
        try {
            const content = await fs.promises.readFile(historyFile, 'utf8');
            const items = JSON.parse(content);

            const filtered = [];
            for (const entry of items) {
                let snapshotPath = entry.snapshot_path || null;

                if (!snapshotPath) {
                    const candidate1 = path.join(entry.dest_root || this.get('recovery', 'snapshot_root'), entry.id, path.basename(entry.source || ''));
                    const candidate2 = path.join(entry.dest_root || this.get('recovery', 'snapshot_root'), entry.id);
                    
                    try {
                        await fs.promises.access(candidate1);
                        snapshotPath = candidate1;
                    } catch {
                        try {
                            await fs.promises.access(candidate2);
                            snapshotPath = candidate2;
                        } catch {
                            // Skip this entry if snapshot doesn't exist
                            continue;
                        }
                    }
                }

                if (snapshotPath) {
                    try {
                        await fs.promises.access(snapshotPath);
                        entry.snapshot_path = snapshotPath;
                        filtered.push(entry);
                    } catch {
                        // Skip if snapshot is not accessible
                    }
                }
            }

            if (filtered.length !== items.length) {
                await this.saveHistory(filtered);
            }

            return filtered;
        } catch {
            return [];
        }
    }

    async addHistoryEntry(entry) {
        const history = await this.getHistory();
        const maxEntries = this.getNumber('meta', 'max_history_entries', 100);
        
        history.unshift(entry);
        
        if (history.length > maxEntries) {
            history.splice(maxEntries);
        }
        
        await this.saveHistory(history);
    }

    async updateHistoryEntry(id, updates) {
        const history = await this.getHistory();
        const index = history.findIndex(entry => entry.id === id);
        
        if (index !== -1) {
            history[index] = { ...history[index], ...updates };
            await this.saveHistory(history);
        }
    }

    async saveHistory(history) {
        const historyFile = this.get('meta', 'history_file', HISTORY_PATH);
        const historyDir = path.dirname(historyFile);
        
        await fsUtils.ensureDir(historyDir);
        await fs.promises.writeFile(historyFile, JSON.stringify(history, null, 2));
    }

    getConfigPath() {
        return CONFIG_PATH;
    }

    getHistoryPath() {
        return this.get('meta', 'history_file', HISTORY_PATH);
    }
}

module.exports = new ConfigManager();
