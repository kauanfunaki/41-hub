@echo off
echo.
echo Instalando protocolo Hub Explorer...
echo (Isso registra hub-explorer:// no Windows para abrir pastas de rede)
echo.

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0hub-explorer-install.ps1"

echo.
pause
