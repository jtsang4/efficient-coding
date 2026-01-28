# Worktrunk Install Notes

Use this only when `wt` is not available.

## Preferred install commands (by platform)

macOS / Linux (Homebrew):

```bash
brew install worktrunk
```

Rust (cargo):

```bash
cargo install worktrunk
```

Arch (AUR):

```bash
paru -S worktrunk-bin
```

Windows:

- Windows Terminal may reserve `wt`. Worktrunk suggests using `git-wt` on Windows.
- Install via winget:

```powershell
winget install max-sixty.worktrunk
git-wt config shell install
```

## After install (optional)

Shell integration enables `wt switch` to change your shell's current directory:

```bash
wt config shell install
```

Do not run shell integration without explicit confirmation (it edits shell rc files).

