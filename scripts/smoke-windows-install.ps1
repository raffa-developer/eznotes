param(
  [Parameter(Mandatory = $true)]
  [string]$Installer
)

$ErrorActionPreference = 'Stop'

$tempRoot = if ($env:RUNNER_TEMP) { $env:RUNNER_TEMP } else { $env:TEMP }
$root = Join-Path $tempRoot 'eznotes-install-smoke'
$installDir = Join-Path $root 'app'
$dataDir = Join-Path $root 'data'
$launched = @()

function Remove-SmokeRoot {
  if (Test-Path $root) {
    Remove-Item $root -Recurse -Force -ErrorAction SilentlyContinue
  }
}

function Install-EzNotes {
  $resolved = (Resolve-Path $Installer).Path
  $process = Start-Process -FilePath $resolved -ArgumentList '/S', "/D=$installDir" -Wait -PassThru
  if ($process.ExitCode -ne 0) {
    throw "Installer exited with code $($process.ExitCode)."
  }
}

function Assert-Installed([string]$stage) {
  $exe = Join-Path $installDir 'ezNotes.exe'
  if (-not (Test-Path $exe)) {
    throw "ezNotes.exe was not present after $stage."
  }
  Write-Host "OK: $stage produced $exe"
}

function Start-EzNotes([string]$stage) {
  $exe = Join-Path $installDir 'ezNotes.exe'
  $process = Start-Process -FilePath $exe -ArgumentList "--user-data-dir=$dataDir" -PassThru
  $script:launched += $process
  Start-Sleep -Seconds 8
  $process.Refresh()
  if ($process.HasExited) {
    throw "ezNotes exited during $stage with code $($process.ExitCode)."
  }
  Stop-Process -Id $process.Id -Force
  Start-Sleep -Seconds 2
  Write-Host "OK: $stage launched and stayed running."
}

function Uninstall-EzNotes {
  $uninstaller = Get-ChildItem $installDir -Filter 'Uninstall*.exe' -ErrorAction SilentlyContinue |
    Select-Object -First 1
  if (-not $uninstaller) {
    throw 'The NSIS uninstaller was not found.'
  }

  $process = Start-Process -FilePath $uninstaller.FullName -ArgumentList '/S' -Wait -PassThru
  if ($process.ExitCode -ne 0) {
    throw "Uninstaller exited with code $($process.ExitCode)."
  }

  for ($attempt = 0; $attempt -lt 15; $attempt++) {
    if (-not (Test-Path (Join-Path $installDir 'ezNotes.exe'))) { break }
    Start-Sleep -Seconds 1
  }
  if (Test-Path (Join-Path $installDir 'ezNotes.exe')) {
    throw 'ezNotes.exe remained after uninstall.'
  }
  Write-Host 'OK: uninstall removed ezNotes.exe.'
}

Remove-SmokeRoot
New-Item -ItemType Directory -Path $installDir, $dataDir -Force | Out-Null

try {
  Install-EzNotes
  Assert-Installed 'clean install'
  Start-EzNotes 'clean install'

  Install-EzNotes
  Assert-Installed 'reinstall/upgrade'
  Start-EzNotes 'reinstall/upgrade'

  Uninstall-EzNotes
  Write-Host 'Windows installer smoke test passed.'
} finally {
  foreach ($process in $launched) {
    $process.Refresh()
    if (-not $process.HasExited) {
      Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
    }
  }
  Remove-SmokeRoot
}
