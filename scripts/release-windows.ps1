# release-windows.ps1
#
# Build, sign, verify, and publish the Windows installer for a given
# version of Project Raven, using the SSL.com EV code-signing cert
# loaded into the local Windows User cert store via eSigner CKA.
#
# Why this lives outside CI: the SSL.com eSigner CKA + signtool path
# does not work reliably on hosted GitHub runners (the CKA Cloud Key
# Adapter expects a persistent Windows install, not an ephemeral
# admin VM rebuilt per-run). Instead, the Windows release is driven
# from a single Windows machine that has CKA installed, configured
# in Automated mode, with the Laxcorp EV cert pre-loaded into
# Cert:\CurrentUser\My and HasPrivateKey=True. Mac signing+
# notarization still happens automatically in CI (see
# .github/workflows/release-electron.yml). For the full operator
# guide see docs/RELEASING.md.
#
# Usage:
#   pwsh ./scripts/release-windows.ps1 -Version 2.2.1
#
#   # build + sign locally only, do NOT upload to S3 or invalidate
#   # CloudFront. Useful for verifying the build before a real ship:
#   pwsh ./scripts/release-windows.ps1 -Version 2.2.1 -DryRun
#
#   # upload but only to releases/<version>/, NOT to releases/latest/
#   # (i.e., a versioned-only ship; the website's "Download for
#   # Windows" link keeps pointing at whatever the prior latest was):
#   pwsh ./scripts/release-windows.ps1 -Version 2.2.1 -SkipLatest
#
# Prerequisites (set up once per Windows machine, not per release):
#   1. Node 22+, npm, Rust toolchain (rustup), Visual Studio Build
#      Tools (or VS 2022 with C++ workload).
#   2. Windows 10/11 SDK with x64 signtool.exe under
#      `C:\Program Files (x86)\Windows Kits\10\bin\<ver>\x64\`.
#   3. eSigner CKA installed and configured in Automated +
#      Production mode. Master key file present at the path you
#      pointed CKA at during config. Authenticator app paired with
#      the cert's TOTP secret (regenerated via "reset eSigner PIN
#      or get new QR Code" on the SSL.com cert order page if you
#      ever need to rotate).
#   4. AWS CLI v2 installed; AWS_CA_BUNDLE pointed at a CA bundle
#      that includes any TLS-MITM AV root cert if applicable
#      (see docs/RELEASING.md "Avast / Kaspersky / corporate proxy"
#      section). `aws sts get-caller-identity` should succeed
#      against the raven-deploy IAM user.
#
# Behavior:
#   - Bumps package.json version IF the requested version differs
#     from the current. Commits the bump on the current branch.
#     This is intentionally a side effect; CI/Mac-side picks it up
#     when you tag the release.
#   - Builds the Rust WASAPI module, runs tsc + vite, runs
#     electron-builder which invokes build/win-sign.cjs (which
#     signs every PE binary it produces using
#     WIN_SIGN_THUMBPRINT - autodiscovered by this script).
#   - Authenticode-verifies the resulting Setup.exe + all 4
#     standalone inner binaries. Aborts before upload if any one
#     comes back not-Valid.
#   - Uploads .exe + .blockmap + latest.yml to
#     s3://raven-production-releases/releases/<version>/ and
#     (unless -SkipLatest) also to
#     s3://raven-production-releases/releases/latest/, plus the
#     stable-name `Raven-Windows-Installer.exe` that the website's
#     download link points at.
#   - Invalidates CloudFront for the affected paths so users see
#     the new artifact immediately.

[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern('^\d+\.\d+\.\d+$')]
  [string]$Version,

  [switch]$DryRun,

  [switch]$SkipLatest,

  [string]$Bucket = 'raven-production-releases',

  [string]$CloudFrontDistributionId = 'E1NM5246J1INVW',

  # `Laxcorp` is the substring used to disambiguate our EV code
  # signing cert from any other code-signing cert in the User
  # store. If the legal entity ever renames, update this AND the
  # cert subject on the new SSL.com order.
  [string]$CertSubjectMatch = 'Laxcorp'
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Write-Step {
  param([string]$Msg)
  Write-Host ""
  Write-Host "===> $Msg" -ForegroundColor Cyan
}

function Fail {
  param([string]$Msg)
  Write-Host "ABORT: $Msg" -ForegroundColor Red
  exit 1
}

# Ensure we are at the repo root regardless of where this script was
# invoked from.
$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot
Write-Step "Repo root: $repoRoot"

# ---------------------------------------------------------------
# 1. Preflight: cert in store + signtool + AWS reachable
# ---------------------------------------------------------------
Write-Step "Preflight: cert + signtool + AWS"

$cert = Get-ChildItem -Path Cert:\CurrentUser\My -CodeSigningCert -ErrorAction SilentlyContinue |
  Where-Object { $_.Subject -match $CertSubjectMatch } |
  Select-Object -First 1

if (-not $cert) {
  Write-Host "Certs currently in Cert:\CurrentUser\My:"
  Get-ChildItem -Path Cert:\CurrentUser\My -ErrorAction SilentlyContinue |
    Format-List Subject, Thumbprint, HasPrivateKey
  Fail "EV code-signing cert matching '$CertSubjectMatch' not found in User store. Open eSigner CKA, ensure Automated/Production mode, and click load."
}
if (-not $cert.HasPrivateKey) {
  Fail "Cert $($cert.Thumbprint) has HasPrivateKey=False. CKA's KSP linkage is broken. Reinstall CKA, re-run RegisterKSP.exe."
}
$thumbprint = $cert.Thumbprint
Write-Host "  cert subject     : $($cert.Subject -replace ',.*','')"
Write-Host "  cert thumbprint  : $thumbprint"
Write-Host "  cert NotAfter    : $($cert.NotAfter)"
$daysToExpiry = [math]::Floor(($cert.NotAfter - (Get-Date)).TotalDays)
if ($daysToExpiry -lt 30) {
  Write-Host "  WARNING: cert expires in $daysToExpiry days; renew soon." -ForegroundColor Yellow
}

# Locate signtool.exe (newest x64 SDK install). build/win-sign.cjs
# does its own autodetect at runtime; this preflight check just
# fails earlier and louder if no SDK is installed at all.
$sdkRoot = 'C:\Program Files (x86)\Windows Kits\10\bin'
if (-not (Test-Path $sdkRoot)) {
  Fail "Windows 10 SDK not installed; signtool.exe not found. Install via VS Installer 'Windows 10 SDK' workload."
}
$signtool = Get-ChildItem -Path $sdkRoot -Recurse -Filter 'signtool.exe' -ErrorAction SilentlyContinue |
  Where-Object { $_.Directory.Name -eq 'x64' } |
  Sort-Object FullName -Descending |
  Select-Object -First 1
if (-not $signtool) {
  Fail "No x64 signtool.exe found under $sdkRoot. Add the Windows SDK x64 component."
}
Write-Host "  signtool.exe     : $($signtool.FullName)"

if (-not $DryRun) {
  try {
    $awsId = aws sts get-caller-identity --output text --query Arn 2>&1
    if ($LASTEXITCODE -ne 0) {
      throw "aws sts get-caller-identity exit code $LASTEXITCODE -- $awsId"
    }
    Write-Host "  aws identity     : $awsId"
  } catch {
    Fail "AWS CLI not configured or unreachable: $_. Run 'aws configure' first."
  }
} else {
  Write-Host "  [skipped] AWS preflight (dry-run)"
}

# ---------------------------------------------------------------
# 2. Bump package.json version if needed
# ---------------------------------------------------------------
Write-Step "Version bump check"
$pkgJsonPath = Join-Path $repoRoot 'package.json'
$pkgJson = Get-Content $pkgJsonPath -Raw | ConvertFrom-Json
$currentVersion = $pkgJson.version
Write-Host "  package.json version : $currentVersion"
Write-Host "  requested version    : $Version"

if ($currentVersion -ne $Version) {
  if ($DryRun) {
    Write-Host "  [skipped] package.json bump (dry-run)"
  } else {
    Write-Host "  bumping package.json $currentVersion -> $Version"
    $raw = Get-Content $pkgJsonPath -Raw
    # Replace ONLY the top-level "version": "<x.y.z>" line. Other
    # version fields (runtime versions, dependency pins) stay intact.
    $raw = $raw -replace '("version":\s*")[^"]+(")', "`$1$Version`$2"
    Set-Content -Path $pkgJsonPath -Value $raw -NoNewline
    git add package.json
    git commit -m "chore(release): bump version to $Version" | Out-Null
    Write-Host "  committed bump on current branch (push manually after release)"
  }
} else {
  Write-Host "  package.json already at $Version, no bump needed"
}

# ---------------------------------------------------------------
# 3. Build native Rust WASAPI module
# ---------------------------------------------------------------
Write-Step "Build native WASAPI audio module (Rust)"
Push-Location (Join-Path $repoRoot 'src/native/windows')
try {
  cargo build --release
  if ($LASTEXITCODE -ne 0) { Fail "cargo build failed (exit $LASTEXITCODE)" }
  Copy-Item -Force target/release/raven_windows_audio.dll raven-windows-audio.win32-x64-msvc.node
  if (-not (Test-Path raven-windows-audio.win32-x64-msvc.node)) {
    Fail "Failed to produce raven-windows-audio.win32-x64-msvc.node after cargo build"
  }
  Write-Host "  produced $(Get-Item raven-windows-audio.win32-x64-msvc.node | Select-Object -ExpandProperty Length) bytes"
} finally {
  Pop-Location
}

# ---------------------------------------------------------------
# 4. Build TS + Vite + electron-builder (which signs via win-sign.cjs)
# ---------------------------------------------------------------
Write-Step "Build TypeScript + Vite"
npx tsc
if ($LASTEXITCODE -ne 0) { Fail "tsc failed (exit $LASTEXITCODE)" }
npx vite build
if ($LASTEXITCODE -ne 0) { Fail "vite build failed (exit $LASTEXITCODE)" }

Write-Step "Build Electron app + sign every PE binary via build/win-sign.cjs"
$env:WIN_SIGN_THUMBPRINT = $thumbprint
try {
  npx electron-builder --win --publish never
  if ($LASTEXITCODE -ne 0) { Fail "electron-builder failed (exit $LASTEXITCODE)" }
} finally {
  Remove-Item Env:WIN_SIGN_THUMBPRINT -ErrorAction SilentlyContinue
}

# ---------------------------------------------------------------
# 5. Authenticode-verify every produced PE binary
# ---------------------------------------------------------------
Write-Step "Authenticode-verify every produced PE binary"
$releaseDir = Join-Path $repoRoot "release\$Version"
if (-not (Test-Path $releaseDir)) {
  Fail "Release dir $releaseDir does not exist after electron-builder."
}

# Inner binaries that get extracted at install time. The
# `__uninstaller.exe` is signed before electron-builder embeds it
# into the Setup.exe wrapper, so it does NOT exist as a standalone
# file on disk after the build (the embed step deletes the loose
# copy). That's expected; we don't verify it directly here.
$exes = @(
  Join-Path $releaseDir "Raven-Windows-$Version-Setup.exe"
  Join-Path $releaseDir "win-unpacked\Raven.exe"
  Join-Path $releaseDir "win-unpacked\resources\elevate.exe"
  Join-Path $releaseDir "win-unpacked\resources\app.asar.unpacked\node_modules\@recallai\desktop-sdk\agent-windows.exe"
)
$failed = @()
foreach ($e in $exes) {
  if (-not (Test-Path $e)) {
    $failed += "MISSING: $e"
    continue
  }
  $sig = Get-AuthenticodeSignature $e
  $signer = if ($sig.SignerCertificate) {
    ($sig.SignerCertificate.Subject -split ',' | Where-Object { $_ -match 'CN=' } | Select-Object -First 1).Trim()
  } else { '<none>' }
  Write-Host ("  {0,-12}  {1,-50}  {2}" -f $sig.Status, (Split-Path $e -Leaf), $signer)
  if ($sig.Status -ne 'Valid') {
    $failed += "$(Split-Path $e -Leaf): Status=$($sig.Status) - $($sig.StatusMessage)"
  }
}
if ($failed.Count -gt 0) {
  Fail ("Signature verify failed for $($failed.Count) file(s):`n  " + ($failed -join "`n  "))
}
& $signtool.FullName verify /pa "$releaseDir\Raven-Windows-$Version-Setup.exe" 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
  Fail "signtool verify /pa returned $LASTEXITCODE on the Setup.exe"
}
Write-Host "  All inner + outer binaries verified Valid with full chain to SSL.com EV Root."

# ---------------------------------------------------------------
# 6. Upload to S3 (versioned + optionally latest/)
# ---------------------------------------------------------------
$setupExe   = Join-Path $releaseDir "Raven-Windows-$Version-Setup.exe"
$blockmap   = Join-Path $releaseDir "Raven-Windows-$Version-Setup.exe.blockmap"
$latestYml  = Join-Path $releaseDir 'latest.yml'

if ($DryRun) {
  Write-Step "Dry-run: skipping S3 upload + CloudFront invalidation"
  Write-Host "  Would upload:"
  Write-Host "    $setupExe -> s3://$Bucket/releases/$Version/Raven-Windows-$Version-Setup.exe"
  Write-Host "    $blockmap -> s3://$Bucket/releases/$Version/Raven-Windows-$Version-Setup.exe.blockmap"
  Write-Host "    $latestYml -> s3://$Bucket/releases/$Version/latest.yml"
  if (-not $SkipLatest) {
    Write-Host "    (and same files mirrored to releases/latest/, plus stable-name Raven-Windows-Installer.exe)"
  }
  exit 0
}

Write-Step "Upload binaries first, then latest.yml (clients reading old yml stay on old version mid-flight)"

aws s3 cp $setupExe  "s3://$Bucket/releases/$Version/Raven-Windows-$Version-Setup.exe"           --no-progress
if ($LASTEXITCODE -ne 0) { Fail "S3 upload of Setup.exe to versioned path failed" }
aws s3 cp $blockmap  "s3://$Bucket/releases/$Version/Raven-Windows-$Version-Setup.exe.blockmap"  --no-progress
if ($LASTEXITCODE -ne 0) { Fail "S3 upload of .blockmap to versioned path failed" }

if (-not $SkipLatest) {
  aws s3 cp $setupExe  "s3://$Bucket/releases/latest/Raven-Windows-$Version-Setup.exe"            --no-progress
  if ($LASTEXITCODE -ne 0) { Fail "S3 upload of Setup.exe to latest/ failed" }
  aws s3 cp $blockmap  "s3://$Bucket/releases/latest/Raven-Windows-$Version-Setup.exe.blockmap"   --no-progress
  if ($LASTEXITCODE -ne 0) { Fail "S3 upload of .blockmap to latest/ failed" }
  # Stable-name copy that the website's "Download for Windows" link
  # points to. Same SHA256 as the versioned file - users who download
  # via this link get the current latest, period.
  aws s3 cp $setupExe  "s3://$Bucket/releases/latest/Raven-Windows-Installer.exe"                 --no-progress
  if ($LASTEXITCODE -ne 0) { Fail "S3 upload of stable-name Raven-Windows-Installer.exe failed" }
}

# latest.yml LAST. electron-updater reads this manifest before
# fetching binaries; uploading it before the binaries would create
# a window where clients see "version 2.2.1 available" but the
# 2.2.1 .exe at the URL doesn't exist yet -> 404 mid-update.
aws s3 cp $latestYml "s3://$Bucket/releases/$Version/latest.yml" --no-progress
if ($LASTEXITCODE -ne 0) { Fail "S3 upload of versioned latest.yml failed" }

if (-not $SkipLatest) {
  aws s3 cp $latestYml "s3://$Bucket/releases/latest/latest.yml" --no-progress
  if ($LASTEXITCODE -ne 0) { Fail "S3 upload of latest/latest.yml failed" }
}

# ---------------------------------------------------------------
# 7. CloudFront invalidation
# ---------------------------------------------------------------
Write-Step "CloudFront invalidation"
$paths = @("/releases/$Version/*")
if (-not $SkipLatest) { $paths += "/releases/latest/*" }
$invalidationJson = aws cloudfront create-invalidation `
  --distribution-id $CloudFrontDistributionId `
  --paths $paths `
  --output json 2>&1
if ($LASTEXITCODE -ne 0) {
  Fail "CloudFront invalidation failed: $invalidationJson"
}
$invId = ($invalidationJson | ConvertFrom-Json).Invalidation.Id
Write-Host "  invalidation $invId in flight (covers: $($paths -join ', '))"

# ---------------------------------------------------------------
# 8. Final verify: re-fetch from CDN and confirm signature
# ---------------------------------------------------------------
Write-Step "Verifying CDN serves the signed artifact"
Start-Sleep -Seconds 30  # CloudFront propagation
$cdnPrefix = 'https://d3v3sytmj54fiv.cloudfront.net'
$cdnUrl = if ($SkipLatest) {
  "$cdnPrefix/releases/$Version/Raven-Windows-$Version-Setup.exe"
} else {
  "$cdnPrefix/releases/latest/Raven-Windows-Installer.exe"
}
$tmp = Join-Path $env:TEMP "raven-cdn-verify-$Version.exe"
try {
  Invoke-WebRequest -Uri $cdnUrl -OutFile $tmp -UseBasicParsing -Headers @{ 'Cache-Control' = 'no-cache' }
  $cdnSig = Get-AuthenticodeSignature $tmp
  $localHash = (Get-FileHash $setupExe -Algorithm SHA256).Hash
  $cdnHash   = (Get-FileHash $tmp      -Algorithm SHA256).Hash
  Write-Host "  CDN URL          : $cdnUrl"
  Write-Host "  CDN size         : $((Get-Item $tmp).Length) bytes"
  Write-Host "  CDN SHA256       : $cdnHash"
  Write-Host "  CDN sig status   : $($cdnSig.Status)"
  if ($cdnSig.Status -ne 'Valid') {
    Fail "CDN-served file's Authenticode is $($cdnSig.Status), not Valid. CloudFront propagation lag or wrong file uploaded."
  }
  if ($cdnHash -ne $localHash) {
    Fail "CDN-served file SHA256 ($cdnHash) does not match local SHA256 ($localHash). Cache invalidation may not have propagated yet, or wrong file uploaded."
  }
  Write-Host "  CDN match local  : YES"
} finally {
  Remove-Item $tmp -Force -ErrorAction SilentlyContinue
}

Write-Step "DONE"
Write-Host "Published v$Version Windows artifacts to:"
Write-Host "  s3://$Bucket/releases/$Version/"
if (-not $SkipLatest) {
  Write-Host "  s3://$Bucket/releases/latest/"
  Write-Host "  s3://$Bucket/releases/latest/Raven-Windows-Installer.exe (stable-name)"
}
Write-Host ""
Write-Host "Public download URL:"
Write-Host "  $cdnUrl"
Write-Host ""
Write-Host "If you bumped package.json above, push the bump commit + tag now:"
Write-Host "  git push origin <branch>"
Write-Host "  git tag v$Version && git push origin v$Version"
Write-Host "(The tag triggers the Mac side of release-electron.yml.)"
