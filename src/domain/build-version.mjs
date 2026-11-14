const BUILD = /^(\d{2})(\d{2})(\d{2})b(\d+)$/i;

/** True for a build number such as 151126b1 (day, month, year, build). */
export function isBuildVersion(value) {
  return BUILD.test(String(value || ""));
}

/** Orders build numbers by year, month, day, then build; negative when left is older. */
export function compareBuilds(left, right) {
  const parse = (value) => {
    const match = String(value || "").match(BUILD);
    return match ? [match[3], match[2], match[1], match[4]].map(Number) : null;
  };
  const a = parse(left);
  const b = parse(right);
  if (!a || !b) return String(left || "").localeCompare(String(right || ""));
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] !== b[index]) return a[index] - b[index];
  }
  return 0;
}
