# Security Policy

## Supported versions

Security fixes target the latest released version of okfview.

## Reporting a vulnerability

Please report vulnerabilities privately to the maintainer listed in the repository
instead of opening a public issue. Include the affected version, reproduction steps, and
impact if you can.

## Packaging and macOS signing

Public macOS release builds are intended to be signed with the maintainer's Apple
Developer ID Application certificate and notarized with Apple's notary service before
publication. Release CI verifies the app signatures, Gatekeeper assessment, stapled
notarization tickets, and DMG integrity before uploading assets to GitHub Releases.

Non-release or unsigned CI builds may still use an ad-hoc signature so Apple Silicon
builds have a valid executable signature. That prevents the misleading macOS "damaged"
launch failure, but ad-hoc signing does not provide Developer ID trust or notarization.

On machines with a local signing identity, the packaging hook skips ad-hoc signing so
electron-builder can use the real certificate instead.
