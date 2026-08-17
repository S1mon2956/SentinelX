// Wraps the browser's geolocation API in a Promise. Resolves to null
// (never throws) if location is unsupported, denied, or times out — this
// is always an OPT-IN feature, so failing quietly and just skipping the
// location data is the right behavior, not an error the user needs to see.
export function getLocation() {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
      () => resolve(null),
      { timeout: 5000 }
    );
  });
}
