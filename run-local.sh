#!/bin/bash

# run-local.sh - Test AI review locally

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}AI Review - Local Testing${NC}"
echo "========================="

# Check for required environment variables
if [ -z "$GITHUB_TOKEN" ]; then
    echo "ERROR: GITHUB_TOKEN not set"
    echo "Set it with: export GITHUB_TOKEN=your_token"
    exit 1
fi

if [ -z "$OPENAI_API_KEY" ]; then
    echo "ERROR: OPENAI_API_KEY not set"
    echo "Set it with: export OPENAI_API_KEY=your_key"
    exit 1
fi

# Default values
MODE="light"
REPO="${GITHUB_REPOSITORY:-}"  # Use env var as default
PR=""
POST=""
SITE_DIR="."

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --mode=*)
            MODE="${1#*=}"
            shift
            ;;
        --repo=*)
            REPO="${1#*=}"
            shift
            ;;
        --pr=*)
            PR="${1#*=}"
            shift
            ;;
        --post)
            POST="--post"
            shift
            ;;
        --site-dir=*)
            SITE_DIR="${1#*=}"
            shift
            ;;
        -h|--help)
            echo "Usage: ./run-local.sh [options]"
            echo ""
            echo "Options:"
            echo "  --mode=light|deep     Review mode (default: light)"
            echo "  --repo=owner/repo     Repository to review (required)"
            echo "  --pr=123             PR number to review"
            echo "  --post               Actually post the review (dry-run by default)"
            echo "  --site-dir=path      Site directory (default: .)"
            echo ""
            echo "Examples:"
            echo "  # Review local files (uses repo from .env)"
            echo "  ./run-local.sh"
            echo ""
            echo "  # Review a specific PR"
            echo "  ./run-local.sh --pr=42"
            echo ""
            echo "  # Review a different repo"
            echo "  ./run-local.sh --repo=otherorg/otherrepo"
            echo ""
            echo "  # Deep review and post results"
            echo "  ./run-local.sh --mode=deep --post"
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Check required args
if [ -z "$REPO" ]; then
    echo "ERROR: --repo=owner/repo is required (or set GITHUB_REPOSITORY in .env)"
    exit 1
fi

echo "Using repository: $REPO"

# Build the command
CMD="node scripts/ai-review.js --mode=$MODE --siteDir=$SITE_DIR"

if [ -n "$PR" ]; then
    CMD="$CMD --pr=$PR"
fi

if [ -n "$POST" ]; then
    CMD="$CMD --post"
fi

# Export for the script
export GITHUB_REPOSITORY="$REPO"

echo -e "${GREEN}Running:${NC} $CMD"
echo ""

# Run the review
$CMD