// The Android app of the panel (android/, a Trusted Web Activity). The
// fingerprints are the SHA-256 of the certificates that sign it: the key in
// android/keystore and, if the app ever goes to Google Play, Play's app signing
// key (Play Console > Test and release > App integrity). They are public.
export const ANDROID_APP = {
  packageId: "com.menusalgaderia.painel",
  fingerprints: ["C6:13:01:18:0C:34:38:43:25:D4:A4:2E:D1:03:BE:F0:6B:F2:C9:A1:0F:C5:CB:90:84:0E:91:68:7C:E7:1B:6B"],
};
