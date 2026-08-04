export function compareNaturalNames(
  first: string,
  second: string,
): number {
  return first.localeCompare(second, undefined, {
    numeric: true,
    sensitivity: 'base',
  });
}

export function sortNodes<
  T extends {
    node: string;
  },
>(nodes: readonly T[]): T[] {
  return [...nodes].sort((first, second) =>
    compareNaturalNames(
      first.node,
      second.node,
    ),
  );
}
