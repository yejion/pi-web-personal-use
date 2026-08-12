; Custom NSIS hooks for pi-web. Auto-loaded by electron-builder from the
; default nsis.include path "build/installer.nsh" (also declared explicitly
; in package.json), and applied to BOTH the installer and the uninstaller.
;
; customCheckAppRunning replaces electron-builder's built-in CHECK_APP_RUNNING
; (templates/nsis/include/allowOnlyOneInstallerInstance.nsh), which cannot
; reliably close this app and loops on "cannot be closed, retry":
;
;   - pi-web runs TWO pi-web.exe processes: the Electron main process and the
;     Next.js server child (spawned with ELECTRON_RUN_AS_NODE=1). The server
;     child has NO window, so the default graceful kill (taskkill without /F,
;     i.e. WM_CLOSE) never reaches it, and the PowerShell Stop-Process path is
;     skipped entirely on machines flagged as "PowerShell unavailable" (stock
;     Windows ships with a "Restricted" execution policy).
;   - The default then gives up after ~4s and two attempts.
;
; Strategy here: one graceful WM_CLOSE attempt (a clean quit lets the app's
; own before-quit handler kill the server tree), then escalating force kills
; with /F /T (reaches windowless processes and the whole tree), and only then
; the manual-close retry dialog.

!macro customCheckAppRunning
  ; $R1 = attempt counter: 1 = graceful close, 2..4 = force kill
  StrCpy $R1 0

  ccar_check:
    ; exit code 0 = at least one pi-web.exe is running
    nsExec::Exec `"$SYSDIR\cmd.exe" /C tasklist /FI "IMAGENAME eq ${APP_EXECUTABLE_FILENAME}" /FO CSV /NH | "$SYSDIR\findstr.exe" /B /I /C:"\"${APP_EXECUTABLE_FILENAME}\""`
    Pop $R0
    ${if} $R0 != 0
      Goto ccar_done
    ${endIf}

    IntOp $R1 $R1 + 1

    ${if} $R1 == 1
      ${ifNot} ${isUpdated}
        MessageBox MB_OKCANCEL|MB_ICONEXCLAMATION "$(appRunning)" /SD IDOK IDOK ccar_close
        Quit
      ${endIf}
    ${endIf}

  ccar_close:
    DetailPrint "$(appClosing)"
    ${if} $R1 == 1
      ; graceful: posts WM_CLOSE; the app quits cleanly and its before-quit
      ; handler kills the server tree itself
      nsExec::Exec `taskkill /IM "${APP_EXECUTABLE_FILENAME}"`
    ${else}
      ; force: /F reaches the windowless server child, /T takes the whole tree
      nsExec::Exec `taskkill /F /T /IM "${APP_EXECUTABLE_FILENAME}"`
    ${endIf}
    Pop $R0
    Sleep 1000

    ${if} $R1 < 4
      Goto ccar_check
    ${endIf}

    ; Survived 1 graceful + 3 force kills — most likely running with elevated
    ; permissions. Ask the user to close it manually.
    MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "$(appCannotBeClosed)" /SD IDCANCEL IDRETRY ccar_retry
    Quit

  ccar_retry:
    StrCpy $R1 1 ; skip the "app is running" prompt on retry
    Goto ccar_check

  ccar_done:
!macroend
