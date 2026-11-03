# Builds and signs the panel's Android app:
#   android\Menu-Painel.apk         -> to install on the phones
#   android\app-release-bundle.aab  -> for Google Play, if it is ever used
#
# Only needed when the app's name, icon, colors or domain change; updates to
# the panel itself arrive through the site. Needs JDK 17 and the Android SDK
# (the one from Android Studio works).
#
# Usage, from the project folder:
#   powershell -ExecutionPolicy Bypass -File android\build.ps1
# The key password is in android\keystore\LEIA-ME.txt (asked for, or taken
# from the ANDROID_KEYSTORE_PASSWORD environment variable).

param(
  [string]$Jdk = "$env:USERPROFILE\.bubblewrap\jdk\jdk-17.0.11+9",
  [string]$Sdk = $(if ($env:ANDROID_HOME) { $env:ANDROID_HOME } else { "$env:LOCALAPPDATA\Android\Sdk" })
)

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$keystore = Join-Path $root "keystore\menu-painel.keystore"
$alias = "painel"

if (-not (Test-Path "$Jdk\bin\java.exe")) { throw "JDK 17 not found at $Jdk (pass -Jdk <folder>)." }
if (-not (Test-Path $keystore)) { throw "Signing key not found: $keystore" }
$buildTools = Get-ChildItem "$Sdk\build-tools" -Directory -ErrorAction SilentlyContinue |
  Sort-Object { [version]($_.Name -replace '[^\d.]', '') } -Descending | Select-Object -First 1
if (-not $buildTools) { throw "Android SDK build-tools not found under $Sdk (pass -Sdk <folder>)." }

if (-not $env:ANDROID_KEYSTORE_PASSWORD) {
  $secure = Read-Host "Key password (android\keystore\LEIA-ME.txt)" -AsSecureString
  $env:ANDROID_KEYSTORE_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))
}

$env:JAVA_HOME = $Jdk
$env:ANDROID_HOME = $Sdk
$java = "$Jdk\bin\java.exe"

Push-Location $root
try {
  & .\gradlew.bat --no-daemon assembleRelease bundleRelease
  if ($LASTEXITCODE -ne 0) { throw "Gradle build failed." }

  # APK: align, then sign (v1 + v2 + v3)
  $unsigned = "app\build\outputs\apk\release\app-release-unsigned.apk"
  $aligned = "app\build\outputs\apk\release\app-release-aligned.apk"
  & "$($buildTools.FullName)\zipalign.exe" -f -p 4 $unsigned $aligned
  if ($LASTEXITCODE -ne 0) { throw "zipalign failed." }
  & $java -jar "$($buildTools.FullName)\lib\apksigner.jar" sign --ks $keystore --ks-key-alias $alias `
    --ks-pass env:ANDROID_KEYSTORE_PASSWORD --key-pass env:ANDROID_KEYSTORE_PASSWORD --out Menu-Painel.apk $aligned
  if ($LASTEXITCODE -ne 0) { throw "apksigner failed." }

  # App bundle (Google Play): signed with the same key, as the upload key
  Copy-Item "app\build\outputs\bundle\release\app-release.aab" "app-release-bundle.aab" -Force
  & "$Jdk\bin\jarsigner.exe" -sigalg SHA256withRSA -digestalg SHA-256 -keystore $keystore `
    -storepass:env ANDROID_KEYSTORE_PASSWORD -keypass:env ANDROID_KEYSTORE_PASSWORD app-release-bundle.aab $alias
  if ($LASTEXITCODE -ne 0) { throw "jarsigner failed." }

  & $java -jar "$($buildTools.FullName)\lib\apksigner.jar" verify --print-certs Menu-Painel.apk
  Write-Host ""
  Write-Host "Ready: $root\Menu-Painel.apk and $root\app-release-bundle.aab"
}
finally {
  Pop-Location
}
