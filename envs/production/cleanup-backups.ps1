param([Parameter(Mandatory)][string]$Path)
$ErrorActionPreference = "Stop"

# backup.cmd runs at 02:00, so a backup belongs to the night before its date and Sunday night ends the week
function Get-Night([datetime]$date) { $date.Date.AddDays(-1) }

$tonight = Get-Night (Get-Date)
$weekStart = $tonight.AddDays(-(([int]$tonight.DayOfWeek + 6) % 7))

$backups = @(Get-ChildItem $Path -Directory | Where-Object Name -Match '^\d{8}$' | Sort-Object Name -Descending)
$blueprints = @($backups | Where-Object { Test-Path (Join-Path $_.FullName BLUEPRINTS) } | Select-Object -First 2 -ExpandProperty FullName)
$keptWeeks = @{}

foreach ($backup in $backups) {
  $weeksAgo = [math]::Ceiling(($weekStart - (Get-Night ([datetime]::ParseExact($backup.Name, "yyyyMMdd", $null)))).TotalDays / 7)
  $keep = $weeksAgo -le 0 -or $blueprints -contains $backup.FullName
  if ($weeksAgo -ge 1 -and $weeksAgo -le 3 -and -not $keptWeeks.ContainsKey($weeksAgo)) {
    $keptWeeks[$weeksAgo] = $true
    $keep = $true
  }

  if (-not $keep) {
    Remove-Item $backup.FullName -Recurse -Force
    Write-Output "Deleted $($backup.FullName)"
  } elseif ($blueprints -notcontains $backup.FullName -and (Test-Path (Join-Path $backup.FullName BLUEPRINTS))) {
    Remove-Item (Join-Path $backup.FullName BLUEPRINTS) -Recurse -Force
    Write-Output "Deleted $($backup.FullName)\BLUEPRINTS"
  }
}
