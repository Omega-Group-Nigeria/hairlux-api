import { DispatchConfigResolverService } from './dispatch-config-resolver.service';

describe('DispatchConfigResolverService concurrent offers env', () => {
  const store = {
    getEntry: jest.fn(),
  };

  const make = (envValue: string | undefined) => {
    const configService = {
      get: jest.fn((key: string) => {
        if (key === 'DISPATCH_CONCURRENT_OFFERS') {
          return envValue;
        }
        return undefined;
      }),
    };
    return new DispatchConfigResolverService(
      store as never,
      configService as never,
    );
  };

  it('defaults to 1 when env is unset', () => {
    expect(make(undefined).getConcurrentOffers()).toBe(1);
  });

  it('defaults to 1 when env is empty string', () => {
    expect(make('').getConcurrentOffers()).toBe(1);
  });

  it('reads env value 2', () => {
    expect(make('2').getConcurrentOffers()).toBe(2);
  });

  it('clamps invalid low values up to 1', () => {
    expect(make('0').getConcurrentOffers()).toBe(1);
    expect(make('-3').getConcurrentOffers()).toBe(1);
  });

  it('clamps high values down to 10', () => {
    expect(make('99').getConcurrentOffers()).toBe(10);
  });

  it('falls back to 1 on non-numeric env', () => {
    expect(make('abc').getConcurrentOffers()).toBe(1);
  });
});
