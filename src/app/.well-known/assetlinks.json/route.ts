import { ANDROID_APP } from "@/lib/android-app";

// Digital Asset Links: proves the panel app (android/) belongs to this site, so
// Android opens it full screen, without the address bar. Public by design.
export function GET() {
  return Response.json([
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: {
        namespace: "android_app",
        package_name: ANDROID_APP.packageId,
        sha256_cert_fingerprints: ANDROID_APP.fingerprints,
      },
    },
  ]);
}
