#!/usr/bin/env bash
set -euo pipefail

# BYF installer - downloads from GitHub Releases
GITHUB_REPO="ByronFinn/byf"
INSTALL_DIR="${BYF_INSTALL_DIR:-/usr/local/bin}"
BINARY_NAME="byf"

can_use_sudo() {
  command -v sudo >/dev/null 2>&1 && sudo -n true 2>/dev/null
}

detect_platform() {
  local os arch
  os=$(uname -s | tr '[:upper:]' '[:lower:]')
  arch=$(uname -m)

  case "$os" in
    linux)
      case "$arch" in
        x86_64) echo "linux-x64" ;;
        aarch64|arm64) echo "linux-arm64" ;;
        *) echo "Unsupported architecture: $arch" >&2; exit 1 ;;
      esac
      ;;
    darwin)
      case "$arch" in
        x86_64) echo "macos-x64" ;;
        arm64) echo "macos-arm64" ;;
        *) echo "Unsupported architecture: $arch" >&2; exit 1 ;;
      esac
      ;;
    *)
      echo "Unsupported OS: $os" >&2
      exit 1
      ;;
  esac
}

install_with_user_permissions() {
  local download_url="$1"
  local install_path="$2"

  mkdir -p "$(dirname "$install_path")"
  curl -fsSL "$download_url" -o "$install_path"
  chmod +x "$install_path"
}

install_with_sudo() {
  local download_url="$1"
  local install_path="$2"

  sudo mkdir -p "$(dirname "$install_path")"
  curl -fsSL "$download_url" | sudo tee "$install_path" >/dev/null
  sudo chmod +x "$install_path"
}

main() {
  local platform
  platform=$(detect_platform)

  local download_url="https://github.com/${GITHUB_REPO}/releases/latest/download/${BINARY_NAME}-${platform}"
  local install_path

  echo "Downloading BYF for ${platform}..."

  if [ -w "$INSTALL_DIR" ] || { [ ! -e "$INSTALL_DIR" ] && [ -w "$(dirname "$INSTALL_DIR")" ]; }; then
    install_path="${INSTALL_DIR}/${BINARY_NAME}"
    install_with_user_permissions "$download_url" "$install_path"
  elif can_use_sudo; then
    install_path="${INSTALL_DIR}/${BINARY_NAME}"
    install_with_sudo "$download_url" "$install_path"
  else
    INSTALL_DIR="$HOME/.local/bin"
    install_path="${INSTALL_DIR}/${BINARY_NAME}"
    install_with_user_permissions "$download_url" "$install_path"
    case ":$PATH:" in
      *":$INSTALL_DIR:"*) ;;
      *) echo "NOTE: Make sure $INSTALL_DIR is in your PATH" ;;
    esac
  fi

  echo "✓ BYF installed to ${install_path}"
  echo "Run 'byf --help' to get started"
}

main "$@"
