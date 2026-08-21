param(
  [int]$Port = 8787,
  [switch]$Background,
  [switch]$StopOnly
)

$ErrorActionPreference = "Stop"
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$stoppedCount = 0

function Stop-AgentOnPort {
  param([int]$AgentPort)

  $connections = Get-NetTCPConnection -LocalPort $AgentPort -State Listen -ErrorAction SilentlyContinue
  $processIds = $connections | Select-Object -ExpandProperty OwningProcess -Unique

  if ($processIds) {
    try {
      Write-Host "Requesting graceful local agent shutdown on port $AgentPort..."
      Invoke-RestMethod -Uri "http://127.0.0.1:$AgentPort/shutdown" -Method Post -TimeoutSec 3 | Out-Null
      for ($attempt = 0; $attempt -lt 20; $attempt += 1) {
        Start-Sleep -Milliseconds 100
        $stillListening = Get-NetTCPConnection -LocalPort $AgentPort -State Listen -ErrorAction SilentlyContinue
        if (-not $stillListening) {
          $script:stoppedCount += $processIds.Count
          return
        }
      }
    } catch {
      Write-Host "Graceful shutdown was unavailable; stopping the existing process."
    }
  }

  foreach ($processId in $processIds) {
    if (-not $processId) {
      continue
    }

    $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
    if ($null -eq $process) {
      continue
    }

    Write-Host "Stopping local agent process $($process.Id) on port $AgentPort..."
    Stop-Process -Id $process.Id -Force
    $script:stoppedCount += 1
  }
}

Stop-AgentOnPort -AgentPort $Port

if ($StopOnly) {
  if ($stoppedCount -eq 0) {
    Write-Host "No local agent process was listening on port $Port."
  } else {
    Write-Host "Local agent stopped."
  }
  exit 0
}

if ($Background) {
  Write-Host "Starting local agent in background on port $Port..."
  Start-Process -FilePath "npm.cmd" -ArgumentList "run", "agent:server" -WorkingDirectory $repoRoot -WindowStyle Hidden
  Start-Sleep -Seconds 2
  Write-Host "Local agent restart requested. Check http://localhost:$Port/health"
  exit 0
}

Write-Host "Starting local agent on port $Port. Press Ctrl+C to stop."
Set-Location $repoRoot
npm.cmd run agent:server
