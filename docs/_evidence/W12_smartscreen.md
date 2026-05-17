# W12 — Windows Defender / SmartScreen friction on first launch

Captured 2026-05-08 from a Win11 user (running Windows 11 Pro
26200, Microsoft Defender on, no third-party AV in the path)
downloading
`https://d3v3sytmj54fiv.cloudfront.net/releases/latest/Raven-Windows-Installer.exe`
fresh and double-clicking the resulting .exe.

## What was actually observed

A SmartScreen wall fired:

> **Windows protected your PC**
>
> Microsoft Defender SmartScreen prevented an unrecognized app
> from starting. Running this app might put your PC at risk.

Default action button: **Don't run**.

See [`W12_smartscreen_initial_wall.png`](W12_smartscreen_initial_wall.png).

Clicking **More info** expanded the dialog to show:

```
App:        Raven-Windows-Installer.exe
Publisher:  IN, Rajasthan, Jaipur, Laxcorp Research (OPC)
            Private Limited, U62099RJ2025OPC101181, Laxcorp
            Research (OPC) Private Limited, Private Organization, IN
```

A **Run anyway** button appeared at the bottom of the expanded
dialog. See [`W12_smartscreen_more_info_publisher.png`](W12_smartscreen_more_info_publisher.png).

Clicking Run anyway proceeded to the NSIS installer; install
completed normally; v2.2.1 launched and reported the right
version in Help → About.

## What this proves about the cert

The expanded Publisher field contains two strings that only EV
certs carry, both visible in the screenshot:

- **`Private Organization`** — the schema marker Microsoft uses
  to distinguish EV from OV in `subject:OID.2.5.4.15`. OV certs
  do not include this.
- **`U62099RJ2025OPC101181`** — the company's business
  registration number, written into `subject:serialNumber`.
  EV-only field; not present in OV.

So Windows recognised the cert as EV and rendered it as such.
The signature itself was Valid (the dialog wouldn't show the
Publisher line at all if the signature were broken; it would
say "Unknown publisher" instead).

## Why the wall fired anyway (despite EV)

EV does NOT mean "no SmartScreen on first launch ever." EV
means "fast-track to SmartScreen reputation," which is different.
The actual SmartScreen reputation rules:

- **Per-binary-hash reputation**: SmartScreen tracks the SHA-256
  of every .exe it sees globally. A hash with no prior downloads
  is "unrecognised," regardless of cert type. This installer's
  hash had been built ~16 hours before the screenshot — almost
  zero downloads at that point.
- **Per-cert-issuer reputation**: SmartScreen also tracks the
  signing cert. EV certs accumulate trust faster than OV (a few
  dozen downloads vs thousands) but our cert was issued
  2026-05-05, three days before this screenshot. Almost no
  download history.

Result: SmartScreen sees a brand-new EV cert that has never
signed a binary it has reputation for, signing a binary whose
hash it has never seen. It defaults to the "show wall but allow
Run anyway" path. This is the documented EV-but-new-cert
behavior; not a misconfiguration.

The EV value over OV in this state:

1. The Publisher line shows the verified company name with
   jurisdiction, business number, and "Private Organization"
   marker. OV would just show the company name (still better
   than "Unknown publisher" but less attributable). Unsigned
   binaries show "Unknown publisher" and a different, scarier
   wall.
2. **Run anyway** is a single-click button on the expanded
   dialog. OV's "Run anyway" is sometimes hidden behind multiple
   clicks or absent entirely on locked-down Win10/11 builds.
3. Once the cert accumulates enough cross-binary-hash reputation
   (typically days to weeks of small download volume), the wall
   stops appearing for new hashes signed with the same cert. OV
   needs much higher download volume per hash to reach that
   state.

## Expected timeline before SmartScreen goes silent

Based on Microsoft's published SmartScreen behavior + community
reports for new EV certs:

| Window since first cert use | Expected behavior |
|---|---|
| Days 1–14 | Wall fires for every new binary hash. Run anyway is one click. |
| Days 14–30 | Wall fires intermittently. Cert reputation begins to recognise our binaries faster. |
| Days 30–90 | Wall typically gone for hashes that have any download history. New hashes still get a brief check. |
| Days 90+ | Established cert reputation. Wall rare even for entirely new hashes. |

This is approximate. Reputation acceleration depends on download
volume and absence of false-positive flags from Defender's
malware classifier.

## Action items / no-fix-needed conclusion

- **Source code / signing**: nothing wrong. Cert is valid, EV,
  recognised by Windows. No change needed.
- **Documentation**: this evidence file + the row update in
  `docs/V2_2_STABILITY_PLAN.md` W12 are the deliverables.
- **User-facing**: any download page or onboarding doc the
  marketing site adds should set the expectation up front — "you
  may see a Windows SmartScreen prompt; click More info →
  Run anyway. The publisher is verified as Laxcorp Research (OPC)
  Private Limited."
- **Operationally**: each install during the first ~14 days adds
  a tick toward our cert's reputation. The wall fading is
  passive; just keep shipping.

## Cross-references

- Cert details + signing flow: [docs/WINDOWS_CODE_SIGNING.md](../WINDOWS_CODE_SIGNING.md)
- Original v2.2.1 publish run: 2026-05-08 02:16 UTC
- Cert thumbprint: `F0FAEAC3EFC08EC7F1BB3E0725062966B8E16658`
- Cert validity: 2026-05-05 → 2027-05-02
