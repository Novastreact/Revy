# Revy - Save & Recovery CLI Tool

A user-space backup and recovery tool for Linux systems with interactive CLI interface and customizable configurations.

## Requirements

- **Node.js**: Version 24 or higher
- **Operating System**: Linux (tested) - Windows compatibility unknown
- **Dependencies**: chalk, ora, cli-progress (auto-installed)

## Installation

1. Extract all files to a directory
2. Run the installation script:
```bash
chmod +x revy-install.sh
./revy-install.sh
```

This will:
- Install Node.js dependencies
- Move files to `~/.revy/` and `~/.local/bin/`
- Add `~/.local/bin` to your PATH

3. Reload your shell:
```bash
source ~/.bashrc
```

## Usage

### Interactive Menu
```bash
revy
```

### Quick Commands
```bash
revy -help        # Show help
revy -v           # Show version
revy -history     # Show backup history
revy -edit        # Edit configuration
revy -Rsave       # Quick save with recent settings
revy -Rcove       # Quick recovery of most recent backup
```

## Configuration

Customize settings via:
```bash
revy -edit
```

This opens the configuration file (`~/.revy/config/revy.conf`) in your default editor.

### Key Configuration Sections

**[save]** - Backup settings
- `source`: Directory to backup (default: `$HOME/Downloads`)
- `destination`: Where to store backups (default: `/backup`)
- `excluded`: Comma-separated patterns to exclude

**[recovery]** - Recovery settings
- `recovery_auto_install`: Auto-run npm/pip install after recovery
- `show_destructive_preview`: Show files that will be overwritten

**[permissions]** - File permissions after recovery
- Multiple `post_recovery_chmod` entries for different file types
- `post_recovery_chown`: Set file ownership

**[ui]** - Interface customization
- `single_key_navigation`: Enable single-key menu navigation
- `color_output`: Enable colored terminal output

## File Structure

```
~/.revy/
├── config/revy.conf     # Main configuration
├── lib/                 # Core libraries
├── deps/               # Node.js dependencies
└── ...

~/.local/bin/revy       # Executable
~/.local/share/revy/    # Data and history
```

## Features

- Interactive save/recovery operations
- Automatic progress tracking with ETA
- Backup history management
- Configurable file exclusions
- Permission restoration
- Single-key navigation
- Multi-line user notes support

## Compatibility Notes

- **Tested**: Linux distributions
- **Untested**: Windows systems
- **Required**: Node.js 24+ for optimal performance
- Uses user-space installation (no sudo required)

## Example Workflow

1. Run `revy` to start interactive mode
2. Choose "1. Save" to create a backup
3. Enter source and destination paths (or use defaults)
4. Add optional notes
5. Confirm to start backup with progress display
6. Later, use "2. Recovery" to restore from any backup snapshot

Configuration changes take effect immediately after editing with `revy -edit`.
