@echo off
:: run-local.cmd - Test AI review locally on Windows

echo AI Review - Local Testing
echo =========================

:: Check for required environment variables
if "%GITHUB_TOKEN%"=="" (
    echo ERROR: GITHUB_TOKEN not set
    echo Set it with: set GITHUB_TOKEN=your_token
    echo Or add it to your .env file
    exit /b 1
)

if "%OPENAI_API_KEY%"=="" (
    echo ERROR: OPENAI_API_KEY not set
    echo Set it with: set OPENAI_API_KEY=your_key
    echo Or add it to your .env file
    exit /b 1
)

:: Default values
set MODE=light
set REPO=
set PR=
set POST=
set SITE_DIR=.

:: Parse arguments
:parse
if "%~1"=="" goto endparse
if "%~1"=="--help" goto usage
if "%~1"=="-h" goto usage

:: Parse --mode=value
echo %~1 | findstr /b "--mode=" >nul
if %errorlevel%==0 (
    set MODE=%~1
    set MODE=!MODE:--mode=!
    shift
    goto parse
)

:: Parse --repo=value
echo %~1 | findstr /b "--repo=" >nul
if %errorlevel%==0 (
    set REPO=%~1
    set REPO=!REPO:--repo=!
    shift
    goto parse
)

:: Parse --pr=value
echo %~1 | findstr /b "--pr=" >nul
if %errorlevel%==0 (
    set PR=%~1
    set PR=!PR:--pr=!
    shift
    goto parse
)

:: Parse --site-dir=value
echo %~1 | findstr /b "--site-dir=" >nul
if %errorlevel%==0 (
    set SITE_DIR=%~1
    set SITE_DIR=!SITE_DIR:--site-dir=!
    shift
    goto parse
)

:: Parse --post flag
if "%~1"=="--post" (
    set POST=--post
    shift
    goto parse
)

echo Unknown option: %~1
exit /b 1

:endparse

:: Enable delayed expansion for variable manipulation
setlocal enabledelayedexpansion

:: Extract values from --key=value format
set MODE=!MODE:*--mode=!
set REPO=!REPO:*--repo=!
set PR=!PR:*--pr=!
set SITE_DIR=!SITE_DIR:*--site-dir=!

:: Check required args
if "!REPO!"=="" (
    echo ERROR: --repo=owner/repo is required
    exit /b 1
)

:: Build the command
set CMD=node scripts/ai-review.js --mode=!MODE! --siteDir=!SITE_DIR!

if not "!PR!"=="" (
    set CMD=!CMD! --pr=!PR!
)

if not "!POST!"=="" (
    set CMD=!CMD! --post
)

:: Export for the script
set GITHUB_REPOSITORY=!REPO!

echo Running: !CMD!
echo.

:: Run the review
!CMD!
goto :eof

:usage
echo Usage: run-local.cmd [options]
echo.
echo Options:
echo   --mode=light^|deep     Review mode (default: light)
echo   --repo=owner/repo     Repository to review (required)
echo   --pr=123             PR number to review
echo   --post               Actually post the review (dry-run by default)
echo   --site-dir=path      Site directory (default: .)
echo.
echo Examples:
echo   # Review local files
echo   run-local.cmd --repo=myorg/myrepo
echo.
echo   # Review a specific PR
echo   run-local.cmd --repo=myorg/myrepo --pr=42
echo.
echo   # Deep review and post results
echo   run-local.cmd --repo=myorg/myrepo --mode=deep --post
exit /b 0