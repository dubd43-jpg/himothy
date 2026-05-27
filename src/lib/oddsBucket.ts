// Buckets a pick's American odds into a price band so we can track historical
// performance per band ("how do our -130 to -149 favorites do lately?") and surface
// that on each new pick as a real signal from OUR own verified record.

export function oddsBucket(odds: number | string | null | undefined): string | null {
  if (odds === null || odds === undefined) return null;
  const n = typeof odds === "number" ? odds : Number.parseFloat(String(odds).replace(/[^-+0-9.]/g, ""));
  if (!Number.isFinite(n) || n === 0) return null;
  if (n <= -200) return "Heavy fav (-200+)";
  if (n <= -150) return "Solid fav (-150 to -199)";
  if (n <= -130) return "Moderate fav (-130 to -149)";
  if (n <= -110) return "Slight fav (-110 to -129)";
  if (n < 110) return "Pickem (-110 to +109)";
  if (n < 130) return "Slight dog (+110 to +129)";
  if (n < 150) return "Moderate dog (+130 to +149)";
  return "Big dog (+150+)";
}
