#!/usr/bin/env bash
# install-autojump-rs.sh
# One-click installer for autojump-rs (Rust port of autojump)
# Supports: macOS / Linux, zsh / bash / fish, oh-my-zsh compatible
# Usage:
# bash install-autojump-rs.sh # install
# bash install-autojump-rs.sh --uninstall # uninstall

set -euo pipefail

VERSION="0.5.1"
REPO="xen0n/autojump-rs"
INSTALL_PREFIX="$HOME/.autojump"
BIN_DIR="$INSTALL_PREFIX/bin"
SHARE_DIR="$INSTALL_PREFIX/share/autojump"
INTEGRATION_BASE="https://raw.githubusercontent.com/$REPO/develop/integrations"
MARKER_BEGIN="# >>> autojump-rs >>>"
MARKER_END="# <<< autojump-rs <<<"

# -- Colors & logging --------------------------------------------------------

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[0;33m'
BLUE='\033[0;34m'; BOLD='\033[1m'; NC='\033[0m'

info() { printf "${BLUE}[INFO]${NC} %s\n" "$*"; }
ok() { printf "${GREEN}[ OK ]${NC} %s\n" "$*"; }
warn() { printf "${YELLOW}[WARN]${NC} %s\n" "$*"; }
err() { printf "${RED}[ERR]${NC} %s\n" "$*" >&2; }

# -- Utilities ----------------------------------------------------------------

# Portable download: prefers curl, falls back to wget
dl() {
 local url="$1" dest="$2"
 if command -v curl &>/dev/null; then
 curl -fsSL "$url" -o "$dest"
 elif command -v wget &>/dev/null; then
 wget -q "$url" -O "$dest"
 else
 err "Neither curl nor wget found, cannot download files."
 return 1
 fi
}

# Portable sed in-place (macOS vs GNU)
sed_i() {
 if [[ "$(uname -s)" == "Darwin" ]]; then
 sed -i '' "$@"
 else
 sed -i "$@"
 fi
}

# -- Platform detection -------------------------------------------------------

detect_target() {
 local os arch
 os="$(uname -s)"
 arch="$(uname -m)"

 case "$os" in
 Linux)
 case "$arch" in
 x86_64) echo "x86_64-unknown-linux-musl" ;;
 aarch64) echo "aarch64-unknown-linux-musl" ;;
 armv7l) echo "armv7-unknown-linux-musleabihf" ;;
 arm*) echo "arm-unknown-linux-musleabi" ;;
 i686|i386) echo "i686-unknown-linux-musl" ;;
 mips64*) echo "mips64-unknown-linux-muslabi64" ;;
 mips*) echo "mips-unknown-linux-musl" ;;
 *) echo "" ;;
 esac ;;
 Darwin)
 case "$arch" in
 x86_64) echo "x86_64-apple-darwin" ;;
 arm64) echo "aarch64-apple-darwin" ;;
 *) echo "" ;;
 esac ;;
 *) echo "" ;;
 esac
}

# -- Install binary -----------------------------------------------------------

install_prebuilt() {
 local target="$1"
 local url="https://github.com/$REPO/releases/download/$VERSION/autojump-${target}.tar.gz"
 local tmp_dir
 tmp_dir="$(mktemp -d)"

 info "Downloading prebuilt binary for ${BOLD}${target}${NC} ..."

 if ! dl "$url" "$tmp_dir/autojump.tar.gz"; then
 rm -rf "$tmp_dir"
 return 1
 fi

 mkdir -p "$BIN_DIR"
 tar -xzf "$tmp_dir/autojump.tar.gz" -C "$BIN_DIR"
 chmod +x "$BIN_DIR/autojump"
 rm -rf "$tmp_dir"

 ok "Binary installed to $BIN_DIR/autojump"
}

install_cargo() {
 if ! command -v cargo &>/dev/null; then
 err "cargo not found. Install Rust first: https://rustup.rs"
 return 1
 fi

 info "Building from source with cargo (this may take a minute) ..."
 cargo install autojump --root "$INSTALL_PREFIX" --force 2>&1 | tail -1
 ok "Binary installed to $BIN_DIR/autojump"
}

install_binary() {
 local target
 target="$(detect_target)"

 if [[ -n "$target" ]]; then
 install_prebuilt "$target" || {
 warn "Prebuilt download failed, falling back to cargo ..."
 install_cargo
 }
 else
 warn "No prebuilt binary for this platform, building with cargo ..."
 install_cargo
 fi
}

# -- Install shell integration scripts ----------------------------------------

install_integrations() {
 mkdir -p "$SHARE_DIR"
 info "Downloading shell integration scripts ..."

 local files=("autojump.zsh" "autojump.bash" "autojump.fish")
 local failed=0

 for f in "${files[@]}"; do
 if dl "$INTEGRATION_BASE/$f" "$SHARE_DIR/$f"; then
 chmod 644 "$SHARE_DIR/$f"
 else
 warn "Failed to download $f"
 ((failed++))
 fi
 done

 if (( failed < ${#files[@]} )); then
 ok "Integration scripts saved to $SHARE_DIR/"
 else
 err "Could not download any integration scripts"
 return 1
 fi
}

# -- Shell configuration ------------------------------------------------------

# Check whether our marker block is already present in a file
has_marker() {
 grep -qF "$MARKER_BEGIN" "$1" 2>/dev/null
}

# Remove our marker block from a file
remove_marker_block() {
 local file="$1"
 [[ -f "$file" ]] || return 0
 if has_marker "$file"; then
 sed_i "/$MARKER_BEGIN/,/$MARKER_END/d" "$file"
 fi
}

# Append a source block to an rc file
append_source_block() {
 local file="$1" line="$2"
 has_marker "$file" && return 0 # already configured
 {
 echo ""
 echo "$MARKER_BEGIN"
 echo "$line"
 echo "$MARKER_END"
 } >> "$file"
}

configure_zsh() {
 local rc="$HOME/.zshrc"
 [[ -f "$rc" ]] || return 0

 # If oh-my-zsh plugin "autojump" is active, it will auto-discover
 # ~/.autojump/share/autojump/autojump.zsh -- no rc edits needed.
 if [[ -d "$HOME/.oh-my-zsh" ]] && grep -qE 'plugins=\(.*autojump' "$rc" 2>/dev/null; then
 ok "zsh (oh-my-zsh): autojump plugin will auto-discover ~/.autojump/ -- no changes needed"
 return 0
 fi

 local src='[[ -s "$HOME/.autojump/share/autojump/autojump.zsh" ]] && source "$HOME/.autojump/share/autojump/autojump.zsh"'
 append_source_block "$rc" "$src"
 ok "zsh: configured in $rc"
}

configure_bash() {
 local rc="$HOME/.bashrc"
 [[ -f "$rc" ]] || return 0

 local src='[[ -s "$HOME/.autojump/share/autojump/autojump.bash" ]] && source "$HOME/.autojump/share/autojump/autojump.bash"'
 append_source_block "$rc" "$src"
 ok "bash: configured in $rc"
}

configure_fish() {
 local conf_dir="$HOME/.config/fish/conf.d"
 if [[ -d "$HOME/.config/fish" ]]; then
 mkdir -p "$conf_dir"
 ln -sf "$SHARE_DIR/autojump.fish" "$conf_dir/autojump.fish"
 ok "fish: linked integration to $conf_dir/autojump.fish"
 fi
}

configure_shells() {
 info "Configuring shell integration ..."
 local configured=0

 # Always try to configure detected shells
 if [[ -f "$HOME/.zshrc" ]]; then
 configure_zsh
 ((configured++))
 fi
 if [[ -f "$HOME/.bashrc" ]]; then
 configure_bash
 ((configured++))
 fi
 if [[ -d "$HOME/.config/fish" ]]; then
 configure_fish
 ((configured++))
 fi

 # If nothing matched, configure login shell's rc
 if (( configured == 0 )); then
 local login_shell
 login_shell="$(basename "${SHELL:-bash}")"
 case "$login_shell" in
 zsh)
 touch "$HOME/.zshrc"
 configure_zsh
 ;;
 bash)
 touch "$HOME/.bashrc"
 configure_bash
 ;;
 fish)
 mkdir -p "$HOME/.config/fish"
 configure_fish
 ;;
 *)
 warn "Unsupported shell: $login_shell -- please source the integration script manually"
 warn " source $SHARE_DIR/autojump.bash (for bash-compatible shells)"
 ;;
 esac
 fi
}

# -- Conflict detection -------------------------------------------------------

check_conflicts() {
 # Check if original Python autojump is on PATH ahead of our binary
 local aj_path
 aj_path="$(command -v autojump 2>/dev/null || true)"

 if [[ -n "$aj_path" && "$aj_path" != "$BIN_DIR/autojump" ]]; then
 if file "$aj_path" 2>/dev/null | grep -qi "python\|script\|text"; then
 echo ""
 warn "Original Python autojump detected at: $aj_path"
 warn "It may shadow the Rust version. Options:"
 warn " 1) Remove the original: sudo apt remove autojump / brew uninstall autojump"
 warn " 2) Or ensure ~/.autojump/bin is before $(dirname "$aj_path") in \$PATH"
 fi
 fi
}

# -- Uninstall ----------------------------------------------------------------

do_uninstall() {
 echo ""
 info "Uninstalling autojump-rs ..."

 # Remove installation directory
 if [[ -d "$INSTALL_PREFIX" ]]; then
 rm -rf "$INSTALL_PREFIX"
 ok "Removed $INSTALL_PREFIX"
 fi

 # Clean shell configs
 for rc in "$HOME/.bashrc" "$HOME/.zshrc"; do
 if [[ -f "$rc" ]] && has_marker "$rc"; then
 remove_marker_block "$rc"
 ok "Cleaned $(basename "$rc")"
 fi
 done

 # Clean fish
 local fish_link="$HOME/.config/fish/conf.d/autojump.fish"
 if [[ -L "$fish_link" ]]; then
 rm -f "$fish_link"
 ok "Removed fish integration"
 fi

 # Clean cargo-installed binary if exists
 if [[ -f "$HOME/.cargo/bin/autojump" ]]; then
 warn "Also found ~/.cargo/bin/autojump (from cargo install)"
 warn "Remove it manually if desired: rm ~/.cargo/bin/autojump"
 fi

 echo ""
 ok "Uninstall complete. Restart your shell: exec \$SHELL"
 echo ""
}

# -- Main ---------------------------------------------------------------------

main() {
 if [[ "${1:-}" == "--uninstall" || "${1:-}" == "uninstall" ]]; then
 do_uninstall
 exit 0
 fi

 echo ""
 printf "${BOLD}=================================${NC}\n"
 printf "${BOLD} autojump-rs installer v%s${NC}\n" "$VERSION"
 printf "${BOLD}=================================${NC}\n"
 echo ""

 # Step 1: Install binary
 install_binary

 # Step 2: Install shell integration scripts
 install_integrations

 # Step 3: Configure shells
 configure_shells

 # Step 4: Conflict detection
 check_conflicts

 # Step 5: Summary
 echo ""
 printf "${BOLD}------ Summary ------${NC}\n"
 echo " Binary: $BIN_DIR/autojump"
 echo " Scripts: $SHARE_DIR/"
 echo " Commands: j, jc, jo, jco"
 echo ""
 ok "Installation complete!"
 echo ""
 info "Restart your shell to activate: exec \$SHELL"
 info "To uninstall: bash $0 --uninstall"
 echo ""
}

main "$@"
