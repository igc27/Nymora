!include "${BUILD_RESOURCES_DIR}\runtime-access.nsh"

!macro customInstall
  ; Allow Chromium's sandbox to read only its distributed runtime paths.
  ; No write grants, unrelated recursive changes or user-data modifications.
  !insertmacro nymoraRuntimeAccess
!macroend
