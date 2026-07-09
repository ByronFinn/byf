#!/usr/bin/env bash
set -euo pipefail

# BYF installer - downloads compile binaries from GitHub Releases
# MVP platforms (PRD-0020 / #219): darwin-arm64, linux-x64 only.
# Other OS/arch combos are deferred — install via npm when available, or wait
# for a later release matrix expansion.
GITHUB_REPO="ByronFinn/byf"
INSTALL_DIR="${BYF_INSTALL_DIR:-/usr/local/bin}"
BINARY_NAME="byf"

# Official release assets for this installer (must match release.yml matrix).
MVP_PLATFORMS="darwin-arm64 linux-x64"

can_use_sudo() {
  command -v sudo >/dev/null 2>&1 && sudo -n true 2>/dev/null
}

detect_platform() {
  local os arch platform
  os=$(uname -s | tr '[:upper:]' '[:lower:]')
  arch=$(uname -m)

  case "$os" in
    linux)
      case "$arch" in
        x86_64) platform="linux-x64" ;;
        aarch64|arm64) platform="linux-arm64" ;;
        *) echo "Unsupported architecture: $arch" >&2; exit 1 ;;
      esac
      ;;
    darwin)
      case "$arch" in
        x86_64) platform="darwin-x64" ;;
        arm64) platform="darwin-arm64" ;;
        *) echo "Unsupported architecture: $arch" >&2; exit 1 ;;
      esac
      ;;
    *)
      echo "Unsupported OS: $os" >&2
      exit 1
      ;;
  esac

  case " ${MVP_PLATFORMS} " in
    *" ${platform} "*) echo "$platform" ;;
    *)
      echo "Platform ${platform} is not in the MVP binary matrix (${MVP_PLATFORMS})." >&2
      echo "Deferred platforms are not published on GitHub Releases yet (PRD-0020)." >&2
      echo "Try: npm install -g @byfriends/cli  (requires a JS runtime), or use a supported machine." >&2
      exit 1
      ;;
  esac
}

install_with_user_permissions() {
  local download_url="$1"
  local install_path="$2"
  local tmpdir="$3"

  mkdir -p "$(dirname "$install_path")"
  curl -fsSL "$download_url" -o "$tmpdir/byf.zip"
  unzip -o "$tmpdir/byf.zip" -d "$tmpdir" > /dev/null
  mv "$tmpdir/$BINARY_NAME" "$install_path"
  chmod +x "$install_path"
}

install_with_sudo() {
  local download_url="$1"
  local install_path="$2"
  local tmpdir="$3"

  curl -fsSL "$download_url" -o "$tmpdir/byf.zip"
  unzip -o "$tmpdir/byf.zip" -d "$tmpdir" > /dev/null
  sudo mkdir -p "$(dirname "$install_path")"
  sudo mv "$tmpdir/$BINARY_NAME" "$install_path"
  sudo chmod +x "$install_path"
}

main() {
  local platform
  platform=$(detect_platform)

  local download_url="https://github.com/${GITHUB_REPO}/releases/latest/download/${BINARY_NAME}-${platform}.zip"
  local install_path
  local tmpdir
  tmpdir=$(mktemp -d)
  trap 'rm -rf "$tmpdir"' EXIT

  echo "Downloading BYF for ${platform}..."

  if ! command -v unzip >/dev/null 2>&1; then
    echo "Error: 'unzip' is required but not found. Please install it first." >&2
    exit 1
  fi

  if [ -w "$INSTALL_DIR" ] || { [ ! -e "$INSTALL_DIR" ] && [ -w "$(dirname "$INSTALL_DIR")" ]; }; then
    install_path="${INSTALL_DIR}/${BINARY_NAME}"
    install_with_user_permissions "$download_url" "$install_path" "$tmpdir"
  elif can_use_sudo; then
    install_path="${INSTALL_DIR}/${BINARY_NAME}"
    install_with_sudo "$download_url" "$install_path" "$tmpdir"
  else
    INSTALL_DIR="$HOME/.local/bin"
    install_path="${INSTALL_DIR}/${BINARY_NAME}"
    install_with_user_permissions "$download_url" "$install_path" "$tmpdir"
    case ":$PATH:" in
      *":$INSTALL_DIR:"*) ;;
      *) echo "NOTE: Make sure $INSTALL_DIR is in your PATH" ;;
    esac
  fi

  echo "BYF installed to ${install_path}"
  echo "Run 'byf --help' to get started"
}

main "$@"
