/**
 * Fuzzy, order-independent match of a bank-resolved account name against a
 * person's name on file. Copied from the Beautician payout module's
 * account-name-match.util.ts (same proven logic) rather than imported
 * across module boundaries, to keep Payroll and Beautician payouts as
 * independent parallel systems.
 */

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
 * Passes when every profile-name part appears in the resolved name (any
 * order), or when at least one token of the profile name matches and
 * enough other tokens also match.
 */
export function accountNameMatchesProfile(
    resolvedAccountName: string,
    profileName: string,
): boolean {
    const resolvedTokens = tokenize(resolvedAccountName);
    const profileTokens = tokenize(profileName);

    if (!resolvedTokens.length || !profileTokens.length) {
        return false;
    }

    if (profileTokens.every((token) => tokenMatches(resolvedTokens, token))) {
        return true;
    }

    const anyProfileTokenMatched = profileTokens.some((token) =>
        tokenMatches(resolvedTokens, token),
    );

    if (!anyProfileTokenMatched) {
        return false;
    }

    const matchedCount = countMatchedTokens(profileTokens, resolvedTokens);
    return matchedCount >= Math.min(2, profileTokens.length);
}