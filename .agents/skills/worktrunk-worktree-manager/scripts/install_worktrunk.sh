#!/usr/bin/env bash
set -euo pipefail

# Install Worktrunk (wt) using the best available package manager on this machine.
# This script is intended to be run only after the user explicitly confirms install.

if command -v wt >/dev/null 2>&1; then
  echo "wt is already installed: $(wt --version 2>/dev/null || true)"
  exit 0
fi

os="$(uname -s || true)"

install_with_brew() {
  echo "Installing Worktrunk via Homebrew..."
  brew install worktrunk
}

install_with_cargo() {
  echo "Installing Worktrunk via cargo..."
  cargo install worktrunk
}

install_with_paru() {
  echo "Installing Worktrunk via paru (Arch)..."
  paru -S --noconfirm worktrunk-bin
}

install_with_yay() {
  echo "Installing Worktrunk via yay (Arch)..."
  yay -S --noconfirm worktrunk-bin
}

case "$os" in
  Darwin)
    if command -v brew >/dev/null 2>&1; then
      install_with_brew
    elif command -v cargo >/dev/null 2>&1; then
      install_with_cargo
    else
      echo "No supported installer found on macOS. Install Homebrew or Rust/cargo, then re-run."
      exit 1
    fi
    ;;
  Linux)
    if command -v brew >/dev/null 2>&1; then
      install_with_brew
    elif command -v paru >/dev/null 2>&1; then
      install_with_paru
    elif command -v yay >/dev/null 2>&1; then
      install_with_yay
    elif command -v cargo >/dev/null 2>&1; then
      install_with_cargo
    else
      echo "No supported installer found on Linux (brew/paru/yay/cargo). See references/install.md."
      exit 1
    fi
    ;;
  *)
    echo "Unsupported OS for this installer script: $os"
    echo "See references/install.md for manual installation notes."
    exit 1
    ;;
esac

if ! command -v wt >/dev/null 2>&1; then
  echo "Install command finished but 'wt' is still not found on PATH."
  exit 1
fi

echo "Installed: $(wt --version 2>/dev/null || echo 'wt (version unknown)')"

