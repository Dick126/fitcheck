# 打包 FitCheck 项目用于上传云服务器（自动排除 .venv、数据库、密钥）
param([string]$Out = "fitcheck-upload.zip")

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$tmp = Join-Path $env:TEMP ("fitcheck-pack-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $tmp | Out-Null

foreach ($dir in @("server", "web", "docs", "deploy")) {
    $src = Join-Path $root $dir
    if (Test-Path $src) { Copy-Item $src (Join-Path $tmp $dir) -Recurse }
}
Copy-Item (Join-Path $root "README.md") $tmp -ErrorAction SilentlyContinue

# 排除本地运行产物
Remove-Item (Join-Path $tmp "server\.venv") -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item (Join-Path $tmp "server\.env") -Force -ErrorAction SilentlyContinue
Remove-Item (Join-Path $tmp "server\fitcheck.db*") -Force -ErrorAction SilentlyContinue
Remove-Item (Join-Path $tmp "server\secret.key") -Force -ErrorAction SilentlyContinue
Remove-Item (Join-Path $tmp "server\__pycache__") -Recurse -Force -ErrorAction SilentlyContinue

$zip = Join-Path $root $Out
if (Test-Path $zip) { Remove-Item $zip -Force }
Compress-Archive -Path (Join-Path $tmp "*") -DestinationPath $zip
Remove-Item $tmp -Recurse -Force

Write-Host "已打包: $zip"
Write-Host "上传到服务器: scp $zip root@服务器IP:/root/"
Write-Host "服务器上解压: unzip -o $Out -d /root/fitcheck"
