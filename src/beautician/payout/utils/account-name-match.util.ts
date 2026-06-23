function tokenize(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 1);
}

function tokenMatches(resolvedTokens: string[], token: string): boolean {
  return resolvedTokens.some(
    (resolved) => resolved.includes(token) || token.includes(resolved),
  );
}

/**
 * Fuzzy match Paystack-resolved account name against the beautician's legal name.
 * Requires first-name match plus at least one additional profile name token.
 */
export function accountNameMatchesProfile(
  resolvedAccountName: string,
  firstName: string,
  lastName: string,
): boolean {
  const resolvedTokens = tokenize(resolvedAccountName);
  const profileTokens = tokenize(`${firstName} ${lastName}`);

  if (!resolvedTokens.length || !profileTokens.length) {
    return false;
  }

  const firstNameTokens = tokenize(firstName);
  const firstNameMatched = firstNameTokens.some((token) =>
    tokenMatches(resolvedTokens, token),
  );

  if (!firstNameMatched) {
    return false;
  }

  const matchedCount = profileTokens.filter((token) =>
    tokenMatches(resolvedTokens, token),
  ).length;

  return matchedCount >= Math.min(2, profileTokens.length);
}