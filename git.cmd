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
rem   1. .tools\Git\cmd\git.exe next to this script  -> use it, put its
rem      toolchain on PATH, AND force Windows native OpenSSH (see below).
rem   2. otherwise -> plain "git %*" from PATH (system install); this
rem      branch deliberately does NOT touch any GIT_SSH* variables.
rem
rem SSH fix (important, learned the hard way):
rem   PortableGit's bundled Cygwin ssh.exe / sh.exe cannot create a
rem   signal pipe under restricted sandboxes (Win32 error 5), so any
rem   push/fetch over SSH fails with "Could not read from remote".
rem   Forcing GIT_SSH to the native OpenSSH ssh.exe fixes it; clearing a
rem   pre-set GIT_SSH_COMMAND is needed because that variable makes git
rem   shell out through Cygwin sh.exe and ignores GIT_SSH.
rem   Only applied when the native ssh.exe actually exists.
rem
rem Usage (PowerShell):  & .\git.cmd status   /   & .\git.cmd push
rem Usage (cmd.exe):     git.cmd status
rem ------------------------------------------------------------------
setlocal
set "GITROOT=%~dp0.tools\Git"
set "GITEXE=%GITROOT%\cmd\git.exe"
if exist "%GITEXE%" (
    set "PATH=%GITROOT%\cmd;%GITROOT%\bin;%GITROOT%\usr\bin;%GITROOT%\mingw64\bin;%PATH%"
    if exist "%WINDIR%\System32\OpenSSH\ssh.exe" (
        set "GIT_SSH=%WINDIR%\System32\OpenSSH\ssh.exe"
        set "GIT_SSH_COMMAND="
    )
    "%GITEXE%" %*
) else (
    git %*
)
set "RC=%ERRORLEVEL%"
endlocal & exit /b %RC%
