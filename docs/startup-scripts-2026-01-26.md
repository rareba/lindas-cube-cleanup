# Cross-Platform Startup Scripts

**Date:** 2026-01-26

## Summary

Added cross-platform startup scripts to simplify running the web application on Windows, macOS, and Linux without requiring manual npm commands.

## Changes Made

### New Files

1. **web-app/start.bat** - Windows batch script for Command Prompt
2. **web-app/start.ps1** - Windows PowerShell script (alternative)
3. **web-app/start.sh** - Bash script for macOS and Linux

### Updated Files

1. **docs/web-app-guide.md** - Added documentation for the new startup scripts

## Script Features

All three scripts provide identical functionality:

1. **Node.js Detection** - Checks if Node.js is installed and displays version
2. **npm Detection** - Verifies npm is available
3. **Automatic Dependency Installation** - Runs `npm install` if `node_modules` folder is missing
4. **Server Startup** - Launches the Express server via `node server.js`
5. **User Feedback** - Displays clear messages about what is happening

## Usage

### Windows (Command Prompt)
```cmd
cd web-app
start.bat
```

### Windows (PowerShell)
```powershell
cd web-app
.\start.ps1
```

### macOS / Linux
```bash
cd web-app
chmod +x start.sh   # First time only
./start.sh
```

## Rationale

- Simplifies the startup process for users unfamiliar with npm commands
- Handles first-time setup automatically (no separate npm install step)
- Provides consistent experience across all major platforms
- Shows helpful error messages if Node.js is not installed
