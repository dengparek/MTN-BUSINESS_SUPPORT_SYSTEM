export function resolveUSSDInputs(rawText: string): string[] {
  if (!rawText || rawText.trim() === "") return [];

  const rawParts = rawText.split("*");
  const resolved: string[] = [];

  for (const part of rawParts) {
    const trimmed = part.trim();
    if (trimmed === "00") {
      // 00 -> Home (Reset to root menu)
      resolved.length = 0;
    } else if (trimmed === "0") {
      // 0 -> Back (Remove the last step)
      resolved.pop();
    } else {
      resolved.push(trimmed);
    }
  }

  return resolved;
}
