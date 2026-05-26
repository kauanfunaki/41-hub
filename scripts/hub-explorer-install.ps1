#Requires -Version 5.0
<#
.SYNOPSIS
    Registra o protocolo personalizado hub-explorer:// no Windows.
    Execute UMA VEZ por maquina. Nao requer permissao de administrador.

.DESCRIPTION
    Cria uma entrada em HKCU\Software\Classes\hub-explorer que faz o Windows
    chamar um script PowerShell ao clicar em links hub-explorer:// no Chrome/Edge.
    O script converte o caminho e abre o Explorer na pasta de rede correta.
#>

$ErrorActionPreference = 'Stop'

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "   Hub Explorer - Instalacao do Protocolo  " -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# ── 1. Copiar o script handler para AppData (sem espaco no caminho) ─────────

$handlerDir    = Join-Path $env:LOCALAPPDATA 'HubExplorer'
$handlerScript = Join-Path $handlerDir 'open.ps1'

New-Item -ItemType Directory -Force -Path $handlerDir | Out-Null

# Conteudo do handler (copiado aqui para que o .bat seja auto-contido)
$scriptContent = @'
param([string]$Url)
$encoded = $Url -replace 'hub-explorer://', ''
$decoded = [uri]::UnescapeDataString($encoded)
$path    = '\\' + $decoded.Replace('/', '\')
if (Test-Path $path) {
    Invoke-Item $path
} else {
    Start-Process -FilePath 'explorer.exe' -ArgumentList $path
}
'@

[System.IO.File]::WriteAllText($handlerScript, $scriptContent, [System.Text.Encoding]::UTF8)
Write-Host "  Handler instalado em: $handlerScript" -ForegroundColor Gray

# ── 2. Registrar protocolo no registry do usuario (HKCU, sem admin) ─────────

$regBase = 'HKCU:\Software\Classes\hub-explorer'

# Comando que o Windows executa quando o protocolo e acionado
$cmd = "powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$handlerScript`" `"%1`""

New-Item -Path $regBase -Force | Out-Null
Set-ItemProperty -Path $regBase -Name '(default)' -Value 'URL:Hub Explorer Protocol' -Type String

New-ItemProperty -Path $regBase -Name 'URL Protocol' -Value '' -PropertyType String -Force | Out-Null

New-Item -Path "$regBase\DefaultIcon" -Force | Out-Null
Set-ItemProperty -Path "$regBase\DefaultIcon" -Name '(default)' -Value 'explorer.exe,0' -Type String

New-Item -Path "$regBase\shell\open\command" -Force | Out-Null
Set-ItemProperty -Path "$regBase\shell\open\command" -Name '(default)' -Value $cmd -Type String

Write-Host "  Protocolo hub-explorer:// registrado no Windows." -ForegroundColor Gray

# ── 3. Resultado ─────────────────────────────────────────────────────────────

Write-Host ""
Write-Host "Instalacao concluida com sucesso!" -ForegroundColor Green
Write-Host ""
Write-Host "Proximos passos:" -ForegroundColor Yellow
Write-Host "  1. Se o Chrome estiver aberto, feche e reabra." -ForegroundColor Yellow
Write-Host "  2. Acesse o Hub e clique em qualquer caminho de pasta." -ForegroundColor Yellow
Write-Host "  3. O Chrome vai perguntar 'Abrir hub-explorer?' — clique em Abrir." -ForegroundColor Yellow
Write-Host "     (Essa confirmacao aparece apenas na primeira vez.)" -ForegroundColor Yellow
Write-Host ""
