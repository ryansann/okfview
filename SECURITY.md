# Security Policy

## Supported versions

Security fixes target the latest released version of okfview.

## Reporting a vulnerability

Please report vulnerabilities privately to the maintainer listed in the repository
instead of opening a public issue. Include the affected version, reproduction steps, and
impact if you can.

## Packaging and macOS signing

Current public macOS builds are not notarized. The release workflow disables Apple
certificate auto-discovery in CI and uses an ad-hoc signature so Apple Silicon builds have
a valid executable signature. That prevents the misleading macOS "damaged" launch failure,
but it does not provide Developer ID trust or notarization.

On machines with a local signing identity, the packaging hook skips ad-hoc signing so
electron-builder can use the real certificate instead.

On first launch, macOS may still require right-clicking the app and choosing **Open**, or
clearing quarantine:

```bash
xattr -dr com.apple.quarantine /Applications/okfview.app
```

Future releases can add Developer ID signing and notarization by providing the relevant
Apple signing and notarization secrets to the release workflow.
