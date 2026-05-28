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
        'X64' { return 'windows-x64' }
        'Arm64' { return 'windows-arm64' }
        default {
            Write-Error "Unsupported architecture: $arch"
            exit 1
        }
    }
}

$platform = Get-Platform
$downloadUrl = "https://github.com/$GITHUB_REPO/releases/latest/download/byf-$platform.exe"

Write-Host "Downloading BYF for $platform..."

New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
$installPath = Join-Path $InstallDir $BINARY_NAME

try {
    Invoke-WebRequest -Uri $downloadUrl -OutFile $installPath -UseBasicParsing
} catch {
    Write-Error "Download failed from: $downloadUrl`nError: $_"
    exit 1
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

Write-Host "✓ BYF installed to $installPath"
Write-Host "Run 'byf --help' to get started"
