// GET /api/pincode/serviceability?pincode= — delivery serviceability check.
// Heuristic: serviceable when the first digit is 1-6. Metro prefixes get a
// 2-day estimate, everything else 4 days. City/state resolved from a small
// map of common Indian pincodes (exact match, then 3-digit prefix), with a
// generic fallback.

import { NextRequest } from "next/server";
import { ok, fail, handleApiError } from "@/lib/http";
import type { ServiceabilityResponse } from "@/lib/types";

const METRO_PREFIXES = ["11", "40", "56", "60", "70", "50", "38", "41", "30", "22"];

const PINCODE_AREAS: Record<string, { city: string; state: string }> = {
  "110001": { city: "New Delhi", state: "Delhi" },
  "110016": { city: "New Delhi", state: "Delhi" },
  "122001": { city: "Gurugram", state: "Haryana" },
  "201301": { city: "Noida", state: "Uttar Pradesh" },
  "400001": { city: "Mumbai", state: "Maharashtra" },
  "400051": { city: "Mumbai", state: "Maharashtra" },
  "411001": { city: "Pune", state: "Maharashtra" },
  "560001": { city: "Bengaluru", state: "Karnataka" },
  "560095": { city: "Bengaluru", state: "Karnataka" },
  "500001": { city: "Hyderabad", state: "Telangana" },
  "500081": { city: "Hyderabad", state: "Telangana" },
  "600001": { city: "Chennai", state: "Tamil Nadu" },
  "600028": { city: "Chennai", state: "Tamil Nadu" },
  "700001": { city: "Kolkata", state: "West Bengal" },
  "700091": { city: "Kolkata", state: "West Bengal" },
  "380001": { city: "Ahmedabad", state: "Gujarat" },
  "380015": { city: "Ahmedabad", state: "Gujarat" },
  "390001": { city: "Vadodara", state: "Gujarat" },
  "302001": { city: "Jaipur", state: "Rajasthan" },
  "226001": { city: "Lucknow", state: "Uttar Pradesh" },
  "208001": { city: "Kanpur", state: "Uttar Pradesh" },
  "641001": { city: "Coimbatore", state: "Tamil Nadu" },
  "625001": { city: "Madurai", state: "Tamil Nadu" },
  "682001": { city: "Kochi", state: "Kerala" },
  "695001": { city: "Thiruvananthapuram", state: "Kerala" },
  "751001": { city: "Bhubaneswar", state: "Odisha" },
  "800001": { city: "Patna", state: "Bihar" },
  "492001": { city: "Raipur", state: "Chhattisgarh" },
  "462001": { city: "Bhopal", state: "Madhya Pradesh" },
  "452001": { city: "Indore", state: "Madhya Pradesh" },
  "160017": { city: "Chandigarh", state: "Chandigarh" },
  "141001": { city: "Ludhiana", state: "Punjab" },
  "248001": { city: "Dehradun", state: "Uttarakhand" },
  "781001": { city: "Guwahati", state: "Assam" },
  "171001": { city: "Shimla", state: "Himachal Pradesh" },
};

function resolveArea(pincode: string): { city: string; state: string } {
  const exact = PINCODE_AREAS[pincode];
  if (exact) return exact;
  const prefix = pincode.slice(0, 3);
  const byPrefix = Object.entries(PINCODE_AREAS).find(([code]) => code.slice(0, 3) === prefix);
  if (byPrefix) return byPrefix[1];
  return { city: "Serviceable area", state: "India" };
}

export async function GET(req: NextRequest) {
  try {
    const pincode = req.nextUrl.searchParams.get("pincode")?.trim() ?? "";
    if (!/^\d{6}$/.test(pincode)) {
      return fail(422, "INVALID_PINCODE", "Please enter a valid 6-digit pincode");
    }

    const serviceable = /^[1-6]/.test(pincode);
    const isMetro = METRO_PREFIXES.some((p) => pincode.startsWith(p));
    const area = resolveArea(pincode);

    const response: ServiceabilityResponse = {
      pincode,
      serviceable,
      city: area.city,
      state: area.state,
      estimatedDays: serviceable ? (isMetro ? 2 : 4) : 0,
      codAvailable: serviceable,
    };
    return ok(response);
  } catch (err) {
    return handleApiError(err);
  }
}
