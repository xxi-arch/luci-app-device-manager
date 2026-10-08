#!/usr/bin/env bash
#
# deploy.sh - Deploy luci-app-device-manager directly to an OpenWrt router for development/testing.
#
# Usage:
#   ./tools/deploy.sh [options] <target>
#
# Examples:
#   ./tools/deploy.sh 192.168.1.1
#   ./tools/deploy.sh root@192.168.1.1
#   ./tools/deploy.sh -p 2222 root@192.168.1.1
#

set -euo pipefail

# Color formatting
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

print_info() {
    printf "${BLUE}[INFO]${NC} %s\n" "$1"
}

print_success() {
    printf "${GREEN}[SUCCESS]${NC} %s\n" "$1"
}

print_warn() {
    printf "${YELLOW}[WARN]${NC} %s\n" "$1"
}

print_error() {
    printf "${RED}[ERROR]${NC} %s\n" "$1" >&2
}

show_usage() {
    cat <<EOF
Usage: $0 [options] <target>

Arguments:
    <target>               Router IP address or SSH user@host (e.g., 192.168.1.1 or root@192.168.1.1)

Options:
    -p, --port <port>      SSH port number (default: 22)
    -h, --help             Show this help message

Examples:
    $0 192.168.1.1
    $0 root@192.168.1.1
    $0 -p 2222 root@192.168.31.1
EOF
}

# Parse options
SSH_PORT="22"
TARGET=""

while [[ $# -gt 0 ]]; do
    case "$1" in
        -p|--port)
            SSH_PORT="$2"
            shift 2
            ;;
        -h|--help)
            show_usage
            exit 0
            ;;
        -*)
            print_error "Unknown option: $1"
            show_usage
            exit 1
            ;;
        *)
            if [[ -z "$TARGET" ]]; then
                TARGET="$1"
            else
                print_error "Unexpected argument: $1"
                show_usage
                exit 1
            fi
            shift
            ;;
    esac
done

if [[ -z "$TARGET" ]]; then
    print_error "Target router address is required."
    show_usage
    exit 1
fi

# Normalize SSH target
if [[ "$TARGET" != *"@"* ]]; then
    SSH_TARGET="root@${TARGET}"
    ROUTER_IP="${TARGET}"
else
    SSH_TARGET="${TARGET}"
    ROUTER_IP="${TARGET#*@}"
fi

# Check prerequisites
for cmd in ssh scp tar; do
    if ! command -v "$cmd" &>/dev/null; then
        print_error "Required local command '$cmd' is not found in PATH."
        exit 1
    fi
done

# Resolve workspace directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# Verify essential project files exist
if [[ ! -f "${PROJECT_ROOT}/htdocs/luci-static/resources/view/device-manager/devices.js" ]]; then
    print_error "Missing frontend view file: htdocs/.../devices.js"
    exit 1
fi

if [[ ! -f "${PROJECT_ROOT}/root/usr/share/luci/menu.d/luci-app-device-manager.json" ]]; then
    print_error "Missing menu definition file: root/.../menu.d/luci-app-device-manager.json"
    exit 1
fi

if [[ ! -f "${PROJECT_ROOT}/root/usr/share/rpcd/acl.d/luci-app-device-manager.json" ]]; then
    print_error "Missing ACL definition file: root/.../acl.d/luci-app-device-manager.json"
    exit 1
fi

SSH_OPTS=(-p "${SSH_PORT}" -o BatchMode=no -o ConnectTimeout=5 -o StrictHostKeyChecking=accept-new)
SCP_OPTS=(-P "${SSH_PORT}" -o BatchMode=no -o ConnectTimeout=5 -o StrictHostKeyChecking=accept-new)

print_info "Connecting to OpenWrt router at ${SSH_TARGET} (port: ${SSH_PORT})..."

# Check router connectivity
if ! ssh "${SSH_OPTS[@]}" "${SSH_TARGET}" "echo 'OpenWrt connection OK'" >/dev/null 2>&1; then
    print_error "Failed to connect to ${SSH_TARGET} via SSH. Please check network, IP, port, and SSH key/password."
    exit 1
fi

print_info "Connection verified. Preparing remote directories..."

ssh "${SSH_OPTS[@]}" "${SSH_TARGET}" "
    mkdir -p /www/luci-static/resources/view/device-manager \
             /usr/share/luci/menu.d \
             /usr/share/rpcd/acl.d \
             /etc/uci-defaults \
             /etc/config
"

print_info "Deploying frontend view (devices.js)..."
scp "${SCP_OPTS[@]}" \
    "${PROJECT_ROOT}/htdocs/luci-static/resources/view/device-manager/devices.js" \
    "${SSH_TARGET}:/www/luci-static/resources/view/device-manager/devices.js"

print_info "Deploying LuCI menu and rpcd ACL definitions..."
scp "${SCP_OPTS[@]}" \
    "${PROJECT_ROOT}/root/usr/share/luci/menu.d/luci-app-device-manager.json" \
    "${SSH_TARGET}:/usr/share/luci/menu.d/luci-app-device-manager.json"

scp "${SCP_OPTS[@]}" \
    "${PROJECT_ROOT}/root/usr/share/rpcd/acl.d/luci-app-device-manager.json" \
    "${SSH_TARGET}:/usr/share/rpcd/acl.d/luci-app-device-manager.json"

if [[ -f "${PROJECT_ROOT}/root/etc/uci-defaults/80_device_manager" ]]; then
    print_info "Deploying uci-defaults initialization script..."
    scp "${SCP_OPTS[@]}" \
        "${PROJECT_ROOT}/root/etc/uci-defaults/80_device_manager" \
        "${SSH_TARGET}:/etc/uci-defaults/80_device_manager"
fi

print_info "Ensuring configuration persistence (protecting existing user remarks)..."
ssh "${SSH_OPTS[@]}" "${SSH_TARGET}" "
    if [ ! -f /etc/config/device_manager ]; then
        touch /etc/config/device_manager
        uci commit device_manager
        echo 'Initialized empty /etc/config/device_manager'
    else
        echo 'Existing /etc/config/device_manager preserved.'
    fi
    [ -f /etc/uci-defaults/80_device_manager ] && chmod +x /etc/uci-defaults/80_device_manager
"

print_info "Clearing LuCI cache and restarting rpcd..."
ssh "${SSH_OPTS[@]}" "${SSH_TARGET}" "
    rm -f /tmp/luci-indexcache* /tmp/luci-modulecache*
    /etc/init.d/rpcd restart
"

print_success "Deployment completed successfully!"
printf "\n"
printf "${CYAN}================================================================${NC}\n"
printf "  ${GREEN}luci-app-device-manager${NC} is now active on your router.\n"
printf "\n"
printf "  Access URL:  ${YELLOW}http://%s/cgi-bin/luci/admin/network/device-manager${NC}\n" "${ROUTER_IP}"
printf "  Menu path:   ${YELLOW}网络 -> 设备管理${NC}\n"
printf "\n"
printf "  ${YELLOW}Note:${NC} If you are already logged in, please refresh the page\n"
printf "  with ${CYAN}Ctrl + Shift + R${NC} to clear browser JavaScript cache.\n"
printf "${CYAN}================================================================${NC}\n"
EOF
