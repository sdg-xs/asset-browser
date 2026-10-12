export function visiblePropertySet(name: string): boolean {
  return !/^pset_/i.test(name.trim());
}
