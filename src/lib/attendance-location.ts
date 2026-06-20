// lib/attendance-location.ts
// ─────────────────────────────────────────────────────────────────────────────
// Location validation for check-in / check-out.
//
// STRICT RULE (per requirements):
//   • If the user has an assigned location (user.location_id is set),
//     they can ONLY check in/out from that specific location.
//   • If the user has NO assigned location, check-in/out is BLOCKED entirely —
//     they cannot use any active location as a fallback.
//     (Admin must assign a location to the user first.)
//
// This replaces the old "fall back to any active location" behaviour.
// ─────────────────────────────────────────────────────────────────────────────

import { db } from "@/db";
import { attendanceLocations, users } from "@/db/schema";
import { and, eq } from "drizzle-orm";

/** Haversine distance in metres between two GPS coordinates. */
function haversineMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export interface LocationCheckResult {
  allowed: boolean;
  locationName?: string;
  /** Human-readable reason when allowed === false */
  reason?: string;
}

/**
 * Checks whether `(latitude, longitude)` is within the user's
 * assigned attendance location radius.
 *
 * Rules:
 *  1. User must have a location_id assigned → otherwise blocked.
 *  2. That location must be active → otherwise blocked.
 *  3. User's GPS must be within radius_meters of the location centre.
 */
export async function isWithinAllowedLocation(
  latitude: number,
  longitude: number,
  userId: string,
): Promise<LocationCheckResult> {
  // ── Step 1: fetch user's assigned location ────────────────────────────────
  const userRow = await db
    .select({ location_id: users.location_id })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)
    .then((r) => r[0] ?? null);

  if (!userRow?.location_id) {
    return {
      allowed: false,
      reason:
        "No attendance location is assigned to your account. " +
        "Please contact your admin.",
    };
  }

  // ── Step 2: fetch that specific location (must be active) ─────────────────
  const location = await db
    .select()
    .from(attendanceLocations)
    .where(
      and(
        eq(attendanceLocations.id, userRow.location_id),
        eq(attendanceLocations.is_active, true),
      ),
    )
    .limit(1)
    .then((r) => r[0] ?? null);

  if (!location) {
    return {
      allowed: false,
      reason:
        "Your assigned location is inactive or no longer exists. " +
        "Please contact your admin.",
    };
  }

  // ── Step 3: distance check ────────────────────────────────────────────────
  const dist = haversineMeters(
    latitude,
    longitude,
    parseFloat(String(location.latitude)),
    parseFloat(String(location.longitude)),
  );

  if (dist > location.radius_meters) {
    return {
      allowed: false,
      reason:
        `You are ${Math.round(dist)}m away from "${location.name}" ` +
        `(allowed radius: ${location.radius_meters}m). ` +
        `Move closer and try again.`,
    };
  }

  return { allowed: true, locationName: location.name };
}
