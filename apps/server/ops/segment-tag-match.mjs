const BROAD_TAG_NAMES = new Set(["外包"]);

export function effectiveSegmentTags(tags = []) {
  const normalized = (tags || [])
    .map((tag) => ({ id: String(tag?.id ?? ""), name: String(tag?.name ?? "").trim() }))
    .filter((tag) => tag.id);
  return normalized.filter((tag) => tag.name && !BROAD_TAG_NAMES.has(tag.name));
}

export function effectiveSegmentTagIds(tags = []) {
  return effectiveSegmentTags(tags).map((tag) => tag.id);
}
