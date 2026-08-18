import {
  isLocationServiceable,
  parseServiceableAreas,
  ServiceableArea,
} from './serviceable-area.utils';

describe('serviceable-area.utils', () => {
  describe('parseServiceableAreas', () => {
    it('normalizes case and trims whitespace', () => {
      expect(
        parseServiceableAreas([{ state: '  LAGOS ', city: ' * ' }]),
      ).toEqual([{ state: 'lagos', city: '*' }]);
    });

    it('drops invalid or incomplete entries', () => {
      const value: unknown[] = [
        { state: 'Lagos', city: 'Lagos' },
        { state: '', city: 'Ikeja' },
        { city: 'Ikeja' },
        null,
        'nope',
        42,
      ];

      expect(parseServiceableAreas(value)).toEqual([
        { state: 'lagos', city: 'lagos' },
      ]);
    });

    it('returns an empty list for non-array input', () => {
      expect(parseServiceableAreas(undefined)).toEqual([]);
      expect(parseServiceableAreas('[]')).toEqual([]);
      expect(parseServiceableAreas({})).toEqual([]);
    });
  });

  describe('isLocationServiceable', () => {
    const areas: ServiceableArea[] = [
      { state: 'lagos', city: 'lagos' },
      { state: 'ogun', city: '*' },
    ];

    it('matches an exact city in state', () => {
      expect(
        isLocationServiceable({ state: 'Lagos', city: 'Lagos' }, areas),
      ).toBe(true);
    });

    it('matches any city in a wildcard state', () => {
      expect(
        isLocationServiceable({ state: 'Ogun', city: 'Abeokuta' }, areas),
      ).toBe(true);
    });

    it('is case-insensitive', () => {
      expect(
        isLocationServiceable({ state: 'LAGOS', city: 'lagos' }, areas),
      ).toBe(true);
    });

    it('rejects a city in the wrong state', () => {
      expect(
        isLocationServiceable({ state: 'Lagos', city: 'Ikeja' }, areas),
      ).toBe(false);
    });

    it('fails closed when location info is missing', () => {
      expect(isLocationServiceable(null, areas)).toBe(false);
      expect(isLocationServiceable({ state: 'Lagos', city: null }, areas)).toBe(
        false,
      );
      expect(isLocationServiceable({}, areas)).toBe(false);
    });

    it('rejects everything when the area list is empty', () => {
      expect(isLocationServiceable({ state: 'Lagos', city: 'Lagos' }, [])).toBe(
        false,
      );
    });
  });
});
