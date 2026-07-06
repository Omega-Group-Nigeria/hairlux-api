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

function countMatchedTokens(
  profileTokens: string[],
  resolvedTokens: string[],
): number {
  return profileTokens.filter((token) => tokenMatches(resolvedTokens, token))
    .length;
}

/**
 * Fuzzy, order-independent match of bank-resolved account name vs profile name.
 * Passes when every profile name part appears in the resolved name (any order),
 * or when the first name matches and enough other profile tokens match.
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

  if (
    profileTokens.every((token) => tokenMatches(resolvedTokens, token))
  ) {
    return true;
  }

  const firstNameTokens = tokenize(firstName);
  const firstNameMatched = firstNameTokens.some((token) =>
    tokenMatches(resolvedTokens, token),
  );

  if (!firstNameMatched) {
    return false;
  }

  const matchedCount = countMatchedTokens(profileTokens, resolvedTokens);
  return matchedCount >= Math.min(2, profileTokens.length);
}