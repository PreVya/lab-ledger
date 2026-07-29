/**
 * ============================================================================
 * LAB HEADER CONFIGURATION — EDIT THIS FILE WITH YOUR REAL DETAILS
 * ============================================================================
 * File to edit : src/lib/lab-profile.ts
 * Logo image   : src/assets/lab-logo.png  (replace this PNG with your own,
 *                keep the same file name & path — square image works best)
 *
 * Everything below is printed on the bill header.
 * ============================================================================
 */
import logoUrl from "@/assets/lab-logo.png";

export const LAB_PROFILE = {
  /** Big, bold, centred at the very top of the bill. */
  name: "PRATHAM PATHOLOGY LABORATORY",
  /** Small, not bold, directly under the lab name. */
  address: "Shop No. 1, Main Road, Your City, State – 000000 · Ph: 00000 00000",
  /** Centre logo (replace src/assets/lab-logo.png). */
  logoUrl,
  /** Left of the logo — doctor name (bold, small) + designation (not bold). */
  doctorName: "Dr. Full Name",
  doctorDesignation: "Consultant Pathologist (MD)",
  /** Right of the logo — printed on two separate lines, not bold. */
  timingsLine1: "Lab timings: 8 AM to 4 PM",
  timingsLine2: "Sunday closed",
  /** Optional footer line at the bottom of the bill. Set to "" to hide. */
  footerNote: "Thank you",
};

export type LabProfile = typeof LAB_PROFILE;
