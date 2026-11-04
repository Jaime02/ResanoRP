@echo off
setlocal
cd /d "%~dp0"

if not exist root.crt (echo root.crt is missing, copy the client folder again from the production machine & goto :fail)

rem The current user store needs no admin, the hostname resolves on its own as the production machine's name
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
