#!/usr/bin/env pwsh
# BYF installer for Windows - downloads from GitHub Releases
param(
    [string]$InstallDir = "$env:LOCALAPPDATA\BYF\bin"
)

$ErrorActionPreference = 'Stop'

$GITHUB_REPO = 'ByronFinn/byf'
$BINARY_NAME = 'byf.exe'

function Get-Platform {
    $arch = [System.Runtime.InteropServices.RuntimeInformation]::ProcessArchitecture
    switch ($arch) {
        'X64' { return 'win32-x64' }
        'Arm64' { return 'win32-arm64' }
        default {
            Write-Error "Unsupported architecture: $arch"
            exit 1
        }
    }
}

$platform = Get-Platform
$downloadUrl = "https://github.com/$GITHUB_REPO/releases/latest/download/byf-$platform.zip"
$tempDir = [System.IO.Path]::GetTempPath() + "byf-install-" + [System.Guid]::NewGuid().ToString("N").Substring(0, 8)

Write-Host "Downloading BYF for $platform..."

New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
New-Item -ItemType Directory -Force -Path $tempDir | Out-Null

try {
    Invoke-WebRequest -Uri $downloadUrl -OutFile "$tempDir\byf.zip" -UseBasicParsing
    Expand-Archive -Path "$tempDir\byf.zip" -DestinationPath $tempDir -Force
    $installPath = Join-Path $InstallDir $BINARY_NAME
    Move-Item -Path "$tempDir\$BINARY_NAME" -Destination $installPath -Force
} catch {
    Write-Error "Download failed from: $downloadUrl`nError: $_"
    exit 1
} finally {
    Remove-Item -Path $tempDir -Recurse -Force -ErrorAction SilentlyContinue
}

$userPath = [Environment]::GetEnvironmentVariable('PATH', 'User')
if ($null -eq $userPath) {
    $userPath = ''
}
if ($userPath -notlike "*$InstallDir*") {
    $newUserPath = if ([string]::IsNullOrEmpty($userPath)) {
        $InstallDir
    } else {
        "$userPath;$InstallDir"
    }
    [Environment]::SetEnvironmentVariable('PATH', $newUserPath, 'User')
    Write-Host "NOTE: Added $InstallDir to your user PATH. Restart your shell to use 'byf'."
}

Write-Host "BYF installed to $installPath"
Write-Host "Run 'byf --help' to get started"
