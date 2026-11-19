// The path of the first difference between two values, or undefined when they are the same
export function firstDifference(a: unknown, b: unknown, path = "$"): string | undefined {
  if (Object.is(a, b)) return undefined;
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime() ? undefined : `${path}: date`;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) {
    return `${path}: ${String(a)} !== ${String(b)}`;
  }
  if (Array.isArray(a) !== Array.isArray(b)) return `${path}: array against object`;
  const keysA = Reflect.ownKeys(a);
  const keysB = Reflect.ownKeys(b);
  if (keysA.length !== keysB.length) {
    return `${path}: keys ${keysA.map(String).join(",").slice(0, 200)} !== ${keysB.map(String).join(",").slice(0, 200)}`;
  }
  for (const key of keysA) {
    // The live query that produced the row and its key in it, which follow the shape of the query, not its rows
    if (key === "$collectionId" || key === "$key") continue;
    const difference = firstDifference(
      (a as Record<PropertyKey, unknown>)[key],
      (b as Record<PropertyKey, unknown>)[key],
      `${path}.${String(key)}`,
    );
    if (difference !== undefined) return difference;
  }
  return undefined;
}
