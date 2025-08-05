@echo off
:: setup-windows.cmd - Setup AI review for local testing

echo Setting up AI Review for Windows...
echo ==================================

:: Check if .env.example exists
if not exist .env.example (
    echo Creating .env.example...
    (
        echo # Copy this to .env and fill in your values
        echo.
        echo # GitHub Personal Access Token
        echo # Create one at: https://github.com/settings/tokens
        echo # Needs: repo ^(full^), write:discussion permissions
        echo GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx
        echo.
        echo # OpenAI API Key
        echo # Get one at: https://platform.openai.com/api-keys
        echo OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxx
        echo.
        echo # Repository to review ^(owner/repo format^)
        echo GITHUB_REPOSITORY=YourOrg/YourRepo
        echo.
        echo # Optional: Different site directory
        echo # SITE_DIR=./dist
    ) > .env.example
)

:: Copy .env.example to .env if it doesn't exist
if not exist .env (
    echo Creating .env from .env.example...
    copy .env.example .env
    echo.
    echo IMPORTANT: Edit .env and add your API keys!
    notepad .env
) else (
    echo .env already exists - skipping
)

:: Install dotenv if needed
echo.
echo Installing dotenv package...
npm install dotenv

echo.
echo Setup complete!
echo.
echo Next steps:
echo 1. Edit .env file with your API keys
echo 2. Run the review:
echo    - With batch:      run-local.cmd --repo=owner/repo
echo    - With PowerShell: .\run-local.ps1 -repo owner/repo
echo.
pause