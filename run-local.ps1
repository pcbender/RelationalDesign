# run-local.ps1 - Test AI review locally on Windows

param(
    [string]$mode = "light",
    [string]$repo = "",
    [string]$pr = "",
    [switch]$post,
    [string]$siteDir = ".",
    [switch]$help
)

Write-Host "AI Review - Local Testing" -ForegroundColor Blue
Write-Host "=========================" -ForegroundColor Blue

# Show help if requested
if ($help) {
    Write-Host @"

Usage: .\run-local.ps1 [options]

Options:
  -mode light|deep      Review mode (default: light)
  -repo owner/repo      Repository to review (required)
  -pr 123              PR number to review
  -post                Actually post the review (dry-run by default)
  -siteDir path        Site directory (default: .)
  -help                Show this help

Examples:
  # Review local files (uses repo from .env)
  .\run-local.ps1

  # Review a specific PR
  .\run-local.ps1 -pr 42

  # Review a different repo
  .\run-local.ps1 -repo otherorg/otherrepo

  # Deep review and post results
  .\run-local.ps1 -mode deep -post
"@
    exit 0
}

# Load .env file if it exists
$envFile = ".env"
if (Test-Path $envFile) {
    Write-Host "Loading environment from .env file..." -ForegroundColor Gray
    Get-Content $envFile | ForEach-Object {
        if ($_ -match '^([^#][^=]+)=(.*)$') {
            $key = $matches[1].Trim()
            $value = $matches[2].Trim()
            Write-Host "Setting environment variable: $key" -ForegroundColor Gray
            [Environment]::SetEnvironmentVariable($key, $value, "Process")
        }
    }
}
else {
    Write-Host "No .env file found, using environment variables only." -ForegroundColor Redexit 1
}

# Check for required environment variables
if (-not $env:GITHUB_TOKEN) {
    Write-Host "ERROR: GITHUB_TOKEN not set" -ForegroundColor Red
    Write-Host "Set it with: `$env:GITHUB_TOKEN='your_token'"
    Write-Host "Or add it to your .env file"
    exit 1
}

if (-not $env:OPENAI_API_KEY) {
    Write-Host "ERROR: OPENAI_API_KEY not set" -ForegroundColor Red
    Write-Host "Set it with: `$env:OPENAI_API_KEY='your_key'"
    Write-Host "Or add it to your .env file"
    exit 1
}

Write-Host "repo before: $($repo)" -ForegroundColor Gray

# Use repo from parameter or environment
if (-not $repo) {
    if ($env:GITHUB_REPOSITORY) {
        $repo = $env:GITHUB_REPOSITORY
        Write-Host "Using repository from .env: $repo" -ForegroundColor Gray
    }
    else {
        Write-Host "ERROR: -repo owner/repo is required (or set GITHUB_REPOSITORY in .env)" -ForegroundColor Red
        exit 1
    }
}

Write-Host "repo after: $($repo)" -ForegroundColor Gray

# Build the command
$cmd = @("node", "scripts/ai-review.js")

# Add mode (already has the value, not --mode=value format)
$cmd += "--mode=$mode"
$cmd += "--siteDir=$siteDir"

if ($pr) {
    $cmd += "--pr=$pr"
}

if ($post) {
    $cmd += "--post"
}

# Add repo argument
$cmd += "--repo=$repo"

# Set repository for the script (for backward compatibility)
$env:GITHUB_REPOSITORY = $repo

Write-Host "Running: $($cmd -join ' ')" -ForegroundColor Green
Write-Host ""

# Run the review
& $cmd[0] $cmd[1..($cmd.Length - 1)]