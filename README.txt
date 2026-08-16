Comandos para  upload de atualizações

powershell -ExecutionPolicy Bypass -File .\atualizar-versao.ps1

git add .
git commit -m "Repor lista de paises completa apos atualizar versão com script"
git push origin main

Se necessário:
firebase deploy