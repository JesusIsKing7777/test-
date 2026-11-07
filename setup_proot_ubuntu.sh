#!/usr/bin/env bash
set -e
echo "[SETUP] Installing PRoot-Distro in Termux..."
pkg update -y && pkg install proot-distro -y
echo "[SETUP] Installing Ubuntu container instance..."
proot-distro install ubuntu
echo "[SUCCESS] PRoot-Distro Ubuntu container ready. Run 'proot-distro login ubuntu' to enter."
