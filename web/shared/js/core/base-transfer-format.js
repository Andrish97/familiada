// Keep the existing .fambase structure. IDs inside the packet are references
// for remapping, never ownership or IDs to reuse in the new resource.
export function baseExportSnapshot(source, fallbackName) {
  const fields = (rows, keys) => (rows || []).map(row => Object.fromEntries(keys.map(key => [key, row[key]])));
  return structuredClone({
    base: { name: source.base?.name ?? fallbackName },
    categories: fields(source.categories, ['id', 'parent_id', 'name', 'ord']),
    tags: fields(source.tags, ['id', 'name', 'color', 'ord']),
    questions: (source.questions || []).map(row => ({id: row.id, category_id: row.category_id, ord: Number(row.ord) || 0, payload: row.payload || {}})),
    question_tags: fields(source.question_tags, ['question_id', 'tag_id']),
    category_tags: fields(source.category_tags, ['category_id', 'tag_id']),
  });
}

