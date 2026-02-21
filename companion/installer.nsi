; SyncTabs Companion — NSIS Installer Script
; Build with: makensis installer.nsi

!define APP_NAME      "SyncTabs Companion"
!define APP_VERSION   "1.0.0"
!define APP_EXE       "synctabs-companion.exe"
!define INSTALL_DIR   "$PROGRAMFILES64\SyncTabs Companion"
!define REG_UNINSTALL "SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\SyncTabsCompanion"

Name "${APP_NAME} ${APP_VERSION}"
OutFile "dist\SyncTabs-Companion-Setup.exe"
InstallDir "${INSTALL_DIR}"
InstallDirRegKey HKLM "${REG_UNINSTALL}" "InstallLocation"
RequestExecutionLevel admin
SetCompressor /SOLID lzma
Unicode true

; ─── Pages ────────────────────────────────────────────────────────────────────
Page directory
Page instfiles
UninstPage uninstConfirm
UninstPage instfiles

; ─── Installer ────────────────────────────────────────────────────────────────
Section "Main" SecMain
    SetOutPath "$INSTDIR"

    ; Kill any running instance before installing
    ExecWait 'taskkill /F /IM "${APP_EXE}" /T' $0

    ; Wait for process to die
    Sleep 1000

    ; Install files
    File "dist\${APP_EXE}"

    ; Create uninstaller
    WriteUninstaller "$INSTDIR\Uninstall.exe"

    ; Register in Programs & Features
    WriteRegStr   HKLM "${REG_UNINSTALL}" "DisplayName"     "${APP_NAME}"
    WriteRegStr   HKLM "${REG_UNINSTALL}" "DisplayVersion"  "${APP_VERSION}"
    WriteRegStr   HKLM "${REG_UNINSTALL}" "Publisher"       "SyncTabs"
    WriteRegStr   HKLM "${REG_UNINSTALL}" "UninstallString" "$INSTDIR\Uninstall.exe"
    WriteRegStr   HKLM "${REG_UNINSTALL}" "InstallLocation" "$INSTDIR"
    WriteRegStr   HKLM "${REG_UNINSTALL}" "DisplayIcon"     "$INSTDIR\${APP_EXE}"
    WriteRegDWORD HKLM "${REG_UNINSTALL}" "NoModify"        1
    WriteRegDWORD HKLM "${REG_UNINSTALL}" "NoRepair"        1

    ; Launch companion immediately after install
    Exec '"$INSTDIR\${APP_EXE}"'

    MessageBox MB_OK|MB_ICONINFORMATION \
        "${APP_NAME} has been installed successfully.$\n$\n\
Look for the SyncTabs icon in your system tray.$\n$\n\
Open your browser's SyncTabs extension and click the gear icon to configure sync settings."
SectionEnd

; ─── Uninstaller ──────────────────────────────────────────────────────────────
Section "Uninstall"
    ; Kill running instance
    ExecWait 'taskkill /F /IM "${APP_EXE}" /T' $0
    Sleep 500

    ; Remove auto-start registry entry (set by the app itself)
    DeleteRegValue HKCU "SOFTWARE\Microsoft\Windows\CurrentVersion\Run" "SyncTabsCompanion"

    ; Remove installed files
    Delete "$INSTDIR\${APP_EXE}"
    Delete "$INSTDIR\Uninstall.exe"
    RMDir  "$INSTDIR"

    ; Remove Programs & Features entry
    DeleteRegKey HKLM "${REG_UNINSTALL}"

    MessageBox MB_OK|MB_ICONINFORMATION \
        "${APP_NAME} has been uninstalled.$\n$\n\
Your data files in %APPDATA%\SyncTabs have been preserved.$\n\
You can delete that folder manually if you no longer need the data."
SectionEnd
