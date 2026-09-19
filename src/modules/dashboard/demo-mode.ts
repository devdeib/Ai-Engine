/**
 * Temporary product-demo overlay for video recording.
 * Disabled in tests. Set NEXT_PUBLIC_ZEUS_DEMO_DATA=false to use live CRM data.
 * Remove this module after the demo is recorded.
 */
export function isDemoVideoDataEnabled(): boolean {
  if (process.env.NODE_ENV === "test") return false;
  return process.env.NEXT_PUBLIC_ZEUS_DEMO_DATA !== "false";
}
