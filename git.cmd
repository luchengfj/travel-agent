@echo off
rem ------------------------------------------------------------------
rem git.cmd - convenience wrapper for this repo's local PortableGit.
rem
rem Why:
rem   In some long-running DSH sessions the host process started BEFORE
rem   the User PATH was updated, so its environment block is stale and
rem   bare "git" is not found. New terminals / after re-login already
rem   resolve the real git.exe via the persisted User PATH; this shim is
rem   for the in-session case (and as a portable fallback otherwise).
rem
rem Resolution order (no hardcoded drive/path):
rem   1. .tools\Git\cmd\git.exe next to this script  -> use it, and put
rem      its cmd/bin/usr/bin/mingw64/bin on PATH so ssh.exe, sh.exe,
rem      git-lfs and the DLLs are found.
rem   2. otherwise -> plain "git %*" from PATH (system install).
rem
rem Usage (PowerShell):  & .\git.cmd status
rem Usage (cmd.exe):     git.cmd status
rem ------------------------------------------------------------------
setlocal
set "GITROOT=%~dp0.tools\Git"
set "GITEXE=%GITROOT%\cmd\git.exe"
if exist "%GITEXE%" (
    set "PATH=%GITROOT%\cmd;%GITROOT%\bin;%GITROOT%\usr\bin;%GITROOT%\mingw64\bin;%PATH%"
    "%GITEXE%" %*
) else (
    git %*
)
set "RC=%ERRORLEVEL%"
endlocal & exit /b %RC%
