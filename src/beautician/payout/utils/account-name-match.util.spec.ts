import { accountNameMatchesProfile } from './account-name-match.util';

describe('accountNameMatchesProfile', () => {
  it('accepts when resolved name contains first and last name', () => {
    expect(
      accountNameMatchesProfile('ADA CHIOMA OKAFOR', 'Ada', 'Okafor'),
    ).toBe(true);
  });

  it('accepts minor ordering differences', () => {
    expect(
      accountNameMatchesProfile('OKAFOR ADA C', 'Ada', 'Okafor'),
    ).toBe(true);
  });

  it('rejects unrelated account names', () => {
    expect(
      accountNameMatchesProfile('JOHN DOE SMITH', 'Ada', 'Okafor'),
    ).toBe(false);
  });

  it('rejects when only last name matches', () => {
    expect(
      accountNameMatchesProfile('OKAFOR BLESSING', 'Ada', 'Okafor'),
    ).toBe(false);
  });
});