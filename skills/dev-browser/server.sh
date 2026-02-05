#!/bin/bash

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Change to the script directory
cd "$SCRIPT_DIR"

# Default values - auto-enable stealth and anti-detection
HEADLESS=false
STEALTH=true
DRIVER="auto"
NO_FLARESOLVERR=false

# FlareSolverr configuration
FLARESOLVERR_PORT=8191
FLARESOLVERR_CONTAINER_NAME="dev-browser-flaresolverr"

# Function to show help
show_help() {
    cat << 'EOF'
Dev Browser Server - Browser automation with anti-detection

USAGE:
    ./server.sh [OPTIONS]

OPTIONS:
    --headless              Run browser in headless mode (no visible window)
    --stealth               Enable stealth mode (default: ON)
    --no-stealth            Disable stealth mode
    --driver [auto|playwright|patchright]
                            Browser driver to use (default: auto)
                            auto: Use patchright if available, fallback to playwright
    --no-flaresolverr       Disable FlareSolverr auto-start
    --stop                  Stop all dev-browser services and exit
    --help                  Show this help message

EXAMPLES:
    # Start server with all anti-detection features (default)
    ./server.sh

    # Start in headless mode without stealth
    ./server.sh --headless --no-stealth

    # Force use standard Playwright
    ./server.sh --driver playwright

    # Disable FlareSolverr auto-start
    ./server.sh --no-flaresolverr

    # Stop all services
    ./server.sh --stop

ANTI-DETECTION FEATURES:
    By default, the server automatically:
    1. Installs and uses Patchright (if not already installed)
    2. Enables stealth mode to evade bot detection
    3. Starts FlareSolverr Docker container for Cloudflare bypass

    To disable these features, use --no-stealth and/or --no-flaresolverr.

EOF
}

# Function to check if a command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to check if Docker is running
docker_is_running() {
    docker info >/dev/null 2>&1
}

# Function to check if FlareSolverr container is running
flaresolverr_is_running() {
    docker ps --filter "name=$FLARESOLVERR_CONTAINER_NAME" --filter "status=running" --format "{{.Names}}" | grep -q "$FLARESOLVERR_CONTAINER_NAME"
}

# Function to stop FlareSolverr
stop_flaresolverr() {
    if flaresolverr_is_running; then
        echo "Stopping FlareSolverr container..."
        docker stop "$FLARESOLVERR_CONTAINER_NAME" >/dev/null 2>&1
        docker rm "$FLARESOLVERR_CONTAINER_NAME" >/dev/null 2>&1
        echo "✓ FlareSolverr stopped"
    fi
}

# Function to start FlareSolverr
start_flaresolverr() {
    if [ "$NO_FLARESOLVERR" = true ]; then
        return 0
    fi

    if ! command_exists docker; then
        echo "⚠ Docker not found. Skipping FlareSolverr auto-start."
        echo "  To use FlareSolverr, install Docker: https://docs.docker.com/get-docker/"
        return 0
    fi

    if ! docker_is_running; then
        echo "⚠ Docker daemon not running. Skipping FlareSolverr auto-start."
        echo "  Start Docker and re-run, or use --no-flaresolverr to skip this warning."
        return 0
    fi

    if flaresolverr_is_running; then
        echo "✓ FlareSolverr already running on port $FLARESOLVERR_PORT"
        return 0
    fi

    # Check if container exists but stopped
    if docker ps -a --filter "name=$FLARESOLVERR_CONTAINER_NAME" --format "{{.Names}}" | grep -q "$FLARESOLVERR_CONTAINER_NAME"; then
        echo "Starting existing FlareSolverr container..."
        docker start "$FLARESOLVERR_CONTAINER_NAME" >/dev/null 2>&1
    else
        echo "Starting FlareSolverr Docker container..."
        docker run -d \
            --name "$FLARESOLVERR_CONTAINER_NAME" \
            -p "$FLARESOLVERR_PORT:8191" \
            -e LOG_LEVEL=info \
            ghcr.io/flaresolverr/flaresolverr:latest >/dev/null 2>&1
    fi

    # Wait for FlareSolverr to be ready
    echo "Waiting for FlareSolverr to be ready..."
    for i in {1..30}; do
        if curl -s "http://localhost:$FLARESOLVERR_PORT" >/dev/null 2>&1; then
            echo "✓ FlareSolverr ready on port $FLARESOLVERR_PORT"
            return 0
        fi
        sleep 1
    done

    echo "⚠ FlareSolverr failed to start within 30 seconds"
    return 1
}

# Function to stop dev-browser server
stop_server() {
    echo "Stopping dev-browser services..."

    # Stop FlareSolverr
    stop_flaresolverr

    # Find and kill the server process
    local pid
    pid=$(lsof -ti:9222 2>/dev/null || true)
    if [ -n "$pid" ]; then
        echo "Stopping dev-browser server (PID: $pid)..."
        kill -15 "$pid" 2>/dev/null || true
        sleep 1
        # Force kill if still running
        if kill -0 "$pid" 2>/dev/null; then
            kill -9 "$pid" 2>/dev/null || true
        fi
        echo "✓ Server stopped"
    else
        echo "Server not running on port 9222"
    fi

    # Kill any remaining Chrome processes on CDP port
    local chrome_pid
    chrome_pid=$(lsof -ti:9223 2>/dev/null || true)
    if [ -n "$chrome_pid" ]; then
        echo "Stopping Chrome process (PID: $chrome_pid)..."
        kill -9 "$chrome_pid" 2>/dev/null || true
        echo "✓ Chrome stopped"
    fi

    echo "All services stopped."
    exit 0
}

# Function to auto-install patchright
auto_install_patchright() {
    if [ "$DRIVER" = "playwright" ]; then
        return 0
    fi

    echo "Checking for Patchright..."

    # Check if patchright is already installed
    if [ -d "node_modules/patchright" ]; then
        echo "✓ Patchright already installed"
        return 0
    fi

    echo "Patchright not found. Installing..."
    npm install patchright --no-save 2>&1 | tail -5

    if [ -d "node_modules/patchright" ]; then
        echo "✓ Patchright installed successfully"
    else
        echo "⚠ Patchright installation failed, will use Playwright with stealth patches"
        DRIVER="playwright"
    fi
}

# Parse command line arguments
while [[ "$#" -gt 0 ]]; do
    case $1 in
        --headless) HEADLESS=true ;;
        --stealth) STEALTH=true ;;
        --no-stealth) STEALTH=false ;;
        --driver)
            if [[ "$2" == "playwright" || "$2" == "patchright" || "$2" == "auto" ]]; then
                DRIVER="$2"
                shift
            else
                echo "Invalid driver: $2. Must be 'playwright', 'patchright', or 'auto'"
                exit 1
            fi
            ;;
        --no-flaresolverr) NO_FLARESOLVERR=true ;;
        --stop) stop_server ;;
        --help) show_help; exit 0 ;;
        *) echo "Unknown parameter: $1"; echo "Use --help for usage information"; exit 1 ;;
    esac
    shift
done

echo "=========================================="
echo "Dev Browser Server"
echo "=========================================="
echo ""

# Install base dependencies
echo "Installing dependencies..."
npm install 2>&1 | tail -3

# Auto-install patchright if using auto or patchright driver
if [ "$DRIVER" != "playwright" ]; then
    auto_install_patchright
fi

# Start FlareSolverr if enabled
if [ "$NO_FLARESOLVERR" = false ] && [ "$STEALTH" = true ]; then
    start_flaresolverr
fi

echo ""
echo "Starting dev-browser server..."
echo "  Headless: $HEADLESS"
echo "  Stealth: $STEALTH"
echo "  Driver: $DRIVER"
echo "  FlareSolverr: $([ "$NO_FLARESOLVERR" = true ] && echo "disabled" || echo "enabled")"
echo ""

export HEADLESS=$HEADLESS
export STEALTH=$STEALTH
export DRIVER=$DRIVER
export NO_FLARESOLVERR=$NO_FLARESOLVERR
export FLARESOLVERR_PORT=$FLARESOLVERR_PORT

npx tsx scripts/start-server.ts
