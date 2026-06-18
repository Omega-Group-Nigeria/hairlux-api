export type DecimalLike = { toNumber: () => number } | number;

export type BranchAssignmentLike = {
  walkInPrice: DecimalLike | null;
} | null;

export type CatalogWalkInPriced = {
  walkInPrice: DecimalLike;
};

export function decimalToNumber(
  value: DecimalLike | null | undefined,
): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  return typeof value === 'number' ? value : value.toNumber();
}

export function resolveBranchWalkInPrice(
  catalog: CatalogWalkInPriced,
  assignment: BranchAssignmentLike,
): number {
  const override = assignment
    ? decimalToNumber(assignment.walkInPrice)
    : null;

  if (override !== null) {
    return override;
  }

  return decimalToNumber(catalog.walkInPrice) ?? 0;
}