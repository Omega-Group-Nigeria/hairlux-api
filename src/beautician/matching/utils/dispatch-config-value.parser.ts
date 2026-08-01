import { DispatchConfigValueType } from '../constants/dispatch-config.defaults';

export function parseDispatchConfigValue(
  raw: string,
  valueType: DispatchConfigValueType,
): string | number | Record<string, unknown> {
  switch (valueType) {
    case 'int': {
      const parsed = Number.parseInt(raw, 10);
      return Number.isFinite(parsed) ? parsed : 0;
    }
    case 'float': {
      const parsed = Number.parseFloat(raw);
      return Number.isFinite(parsed) ? parsed : 0;
    }
    case 'json':
      try {
        return JSON.parse(raw) as Record<string, unknown>;
      } catch {
        return {};
      }
    default:
      return raw;
  }
}

export function parsePositiveInt(raw: string, fallback: number): number {
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function parsePositiveFloat(raw: string, fallback: number): number {
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}