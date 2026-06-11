export function bulkToggleState(items, key) {
  const selected = (items || []).filter((item) => item.selected)
  const some = selected.some((item) => Boolean(item[key]))
  const all = selected.length > 0 && selected.every((item) => Boolean(item[key]))

  return {
    all,
    some,
    mixed: some && !all,
    nextValue: !all,
  }
}
