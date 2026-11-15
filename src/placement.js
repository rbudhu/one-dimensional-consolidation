// Horizontal payload-centre tolerance in metres; acquisition is deliberately forgiving.
export const CENTERING_TOLERANCE_M = 0.002;
const CENTERED = new Set([
  "insert-gently",
  "support-glass",
  "bottom-stone",
  "bottom-filter",
  "place-ring",
  "top-filter",
  "top-stone",
  "lower-assembly",
  "center-cap",
]);
export function placementTolerance(task) {
  return CENTERED.has(task?.id) ? CENTERING_TOLERANCE_M : 0.095;
}
export function validatePlacement(task, placement) {
  const toleranceM = placementTolerance(task);
  if (
    !placement ||
    placement.objectId !== task?.objectId ||
    placement.targetId !== task?.targetId
  )
    return {
      ok: false,
      message: "Wrong payload or target. Return to the highlighted target.",
      toleranceM,
    };
  const { center, target } = placement;
  const eccentricityM =
    center && target
      ? Math.hypot(center.x - target.x, center.z - target.z)
      : NaN;
  const ok =
    Number.isFinite(eccentricityM) && eccentricityM <= toleranceM + 1e-9;
  return {
    ok,
    toleranceM,
    eccentricityM,
    message: ok
      ? "Centered placement accepted."
      : `Center the payload within ${toleranceM * 1000} mm of the highlighted target; placement restored.`,
  };
}
