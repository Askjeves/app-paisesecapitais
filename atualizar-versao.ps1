# Script para atualizar a versão no index.html
$versao = "v$(Get-Date -Format 'yyyyMMddHHmmss')"
$caminhoIndex = "index.html"

if (-Not (Test-Path $caminhoIndex)) {
    Write-Host "Erro: Ficheiro $caminhoIndex não encontrado." -ForegroundColor Red
    exit 1
}

$content = Get-Content -Path $caminhoIndex -Raw
$newContent = $content -replace '\?v=[^"]*', "?v=$versao"

if ($content -eq $newContent) {
    Write-Host "Aviso: Nenhuma substituição feita. O index.html tem '?v='?" -ForegroundColor Yellow
} else {
    $newContent | Set-Content -Path $caminhoIndex -Encoding UTF8
    Write-Host "Versão atualizada para $versao" -ForegroundColor Green
    Write-Host "Ficheiro atualizado com sucesso." -ForegroundColor Cyan
}