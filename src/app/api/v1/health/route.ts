/**
 * GET /api/v1/health
 * Health check endpoint. Returns system status.
 * No authentication required.
 */
import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({
    data: {
      status: "ok",
      timestamp: new Date().toISOString(),
      version: "1.0.0-phase1",
    },
  });
}
