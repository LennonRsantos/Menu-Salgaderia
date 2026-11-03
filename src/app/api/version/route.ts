import { APP_VERSION } from "@/lib/app-version";

// Version of the deployment that answers. Prerendered with each build, so an
// open panel compares it with the version it was loaded with (see AppUpdates).
export function GET() {
  return Response.json({ version: APP_VERSION });
}
