param(
	[Parameter(Mandatory = $true)]
	[string]$CertPath,
	# A development machine trusts one Caddy root per environment, so only a single-Caddy machine may remove the rest
	[switch]$RemoveOtherCaddyRoots
)

function Test-Administrator {
	$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
	return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

# Caddy only writes the cert a moment after the container starts, so wait briefly for it.
$attempts = 0
while (-not (Test-Path $CertPath) -and $attempts -lt 15) {
	Start-Sleep -Seconds 1
	$attempts++
}

if (-not (Test-Path $CertPath)) {
	Write-Host "No certificate found at $CertPath, skipping."
	exit 0
}

$cert = Get-PfxCertificate -FilePath $CertPath
$alreadyTrusted = Get-ChildItem Cert:\LocalMachine\Root | Where-Object { $_.Thumbprint -eq $cert.Thumbprint }
# Every Caddy root has the same name, so Firefox checks against a stale one and fails with SEC_ERROR_BAD_SIGNATURE
$staleRoots = @()
if ($RemoveOtherCaddyRoots) {
	$staleRoots = @(Get-ChildItem Cert:\LocalMachine\Root | Where-Object { $_.Subject -like "CN=Caddy Local Authority*" -and $_.Thumbprint -ne $cert.Thumbprint })
}

if ($alreadyTrusted -and $staleRoots.Count -eq 0) {
	Write-Host "Certificate already trusted: $CertPath"
	exit 0
}

if (-not (Test-Administrator)) {
	$arguments = @(
		"-NoProfile"
		"-ExecutionPolicy"
		"Bypass"
		"-File"
		"`"$PSCommandPath`""
		"-CertPath"
		"`"$CertPath`""
	)
	if ($RemoveOtherCaddyRoots) {
		$arguments += "-RemoveOtherCaddyRoots"
	}

	Start-Process -FilePath powershell -Verb RunAs -ArgumentList $arguments -Wait
	exit $LASTEXITCODE
}

foreach ($staleRoot in $staleRoots) {
	Remove-Item $staleRoot.PSPath
	Write-Host "Removed stale Caddy root: $($staleRoot.Thumbprint)"
}

if ($alreadyTrusted) {
	exit 0
}

certutil -addstore -f Root $CertPath

if ($LASTEXITCODE -ne 0) {
	throw "Failed to trust certificate."
}

Write-Host "Trusted certificate: $certPath"
