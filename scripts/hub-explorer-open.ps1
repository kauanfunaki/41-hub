param([string]$Url)
# Recebe: hub-explorer://192.168.140.249/Publico/DOCS%20BPO
# Abre:   \\192.168.140.249\Publico\DOCS BPO no Explorer

$encoded = $Url -replace 'hub-explorer://', ''          # retira o prefixo do protocolo
$decoded = [uri]::UnescapeDataString($encoded)          # decodifica %20, %28, etc.
$path    = '\\' + $decoded.Replace('/', '\')            # \\server\share\pasta

if (Test-Path $path) {
    Invoke-Item $path
} else {
    # Tenta abrir mesmo assim (caminho de rede pode demorar para responder)
    Start-Process -FilePath 'explorer.exe' -ArgumentList $path
}
