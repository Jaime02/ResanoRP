@echo off
setlocal
pushd "%~dp0"

if not exist root.crt (echo root.crt is missing, copy the client folder again from the production machine & goto :fail)

if not exist host.txt (echo host.txt is missing, copy the client folder again from the production machine & goto :fail)
set /p HOST_LINE=<host.txt
for /f "tokens=1,2" %%a in ("%HOST_LINE%") do (
  set "HOST_IP=%%a"
  set "HOST_NAME=%%b"
)
rem Some computers get a public DNS from the router, which does not know the name, so it is pinned in the hosts file.
rem Windows takes the first line of a name, so the lines of an earlier address of the server are replaced, not added to
set "HOSTS_FILE=%SystemRoot%\System32\drivers\etc\hosts"
set "HOSTS_ENTRIES=$path = '%HOSTS_FILE%'; $lines = @(Get-Content $path); $entries = @($lines | Where-Object { $fields = $_.Trim() -split '\s+'; $fields[0] -notlike '#*' -and ($fields | Select-Object -Skip 1) -contains '%HOST_NAME%' })"
powershell -NoProfile -Command "%HOSTS_ENTRIES%; if ($entries.Count -ne 1 -or ($entries[0].Trim() -split '\s+')[0] -ne '%HOST_IP%') { exit 1 }" || (
  net session >nul 2>&1 || (
    echo Asking for administrator rights, the setup goes on in a new window
    rem The elevated process does not see mapped network drives, so it runs from a local copy of this folder
    rmdir /s /q "%TEMP%\resanorp-client" 2>nul
    mkdir "%TEMP%\resanorp-client" && copy /y "%~dp0*" "%TEMP%\resanorp-client\" >nul && powershell -NoProfile -Command "Start-Process -FilePath '%TEMP%\resanorp-client\setup.cmd' -Verb RunAs" || goto :fail
    exit /b 0
  )
  powershell -NoProfile -Command "%HOSTS_ENTRIES%; Set-Content $path (@($lines | Where-Object { $entries -notcontains $_ }) + '%HOST_LINE%') -Encoding ASCII" || goto :fail
)

rem The current user store needs no admin
certutil -user -addstore -f Root root.crt >nul || goto :fail
rem Every Caddy root has the same name, so a stale one makes Firefox fail with SEC_ERROR_BAD_SIGNATURE.
rem The user store also lists the machine's roots, which only an admin can remove.
powershell -NoProfile -Command "$current = (Get-PfxCertificate root.crt).Thumbprint; $machine = (Get-ChildItem Cert:\LocalMachine\Root).Thumbprint; Get-ChildItem Cert:\CurrentUser\Root | Where-Object { $_.Subject -like 'CN=Caddy Local Authority*' -and $_.Thumbprint -ne $current -and $_.Thumbprint -notin $machine } | Remove-Item"

echo Done, restart the browser if it was open
pause
exit /b 0

:fail
echo Failed to set up this computer
pause
exit /b 1
