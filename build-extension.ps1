$ErrorActionPreference = 'Stop'

# Keep Python caches, local watch data, tests, and design references out of Chrome.
$extensionDirectory = Join-Path $PSScriptRoot 'extension'
$extensionFiles = @(
    'manifest.json',
    'index.html',
    'popup.html',
    'popup.js',
    'background.js',
    'styles.css',
    'storage.js',
    'backup-client.js',
    'backup-ui.js',
    'companion-model.js',
    'companion-background.js',
    'companion-content.js',
    'companion-ui.js',
    'bookmark-model.js',
    'bookmark-background.js',
    'bookmark-ui.js',
    'bookmark-permissions.js',
    'page-analysis.js',
    'workflow-model.js',
    'cover-flow.js',
    'library-search.js',
    'archive.js',
    'snapshot-viewer.js',
    'workspace.js',
    'app.js'
)

foreach ($file in $extensionFiles) {
    if (-not (Test-Path -LiteralPath (Join-Path $PSScriptRoot $file) -PathType Leaf)) {
        throw "Required extension file is missing: $file"
    }
}

New-Item -ItemType Directory -Path $extensionDirectory -Force | Out-Null

# Refuse unexpected content rather than silently shipping it or deleting files.
foreach ($entry in Get-ChildItem -LiteralPath $extensionDirectory -Force) {
    if ($entry.PSIsContainer -or $entry.Name -notin $extensionFiles) {
        throw "Unexpected content in the extension package: $($entry.Name)"
    }
}

foreach ($file in $extensionFiles) {
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot $file) -Destination (Join-Path $extensionDirectory $file) -Force
}

$manifest = Get-Content -LiteralPath (Join-Path $extensionDirectory 'manifest.json') -Raw | ConvertFrom-Json
foreach ($entry in @($manifest.action.default_popup, $manifest.background.service_worker, $manifest.options_page)) {
    if (-not (Test-Path -LiteralPath (Join-Path $extensionDirectory $entry) -PathType Leaf)) {
        throw "Manifest references a missing file: $entry"
    }
}

Write-Output "Chrome extension ready. Use Load unpacked and select: $extensionDirectory"
