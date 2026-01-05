/**
 * UnitHarmonizer Unit Tests
 * Tests for currency conversion, time unit conversion, and quantity harmonization.
 */

import {
  UnitHarmonizer,
  ExchangeRate,
  TimeUnit,
  QuantityUnit,
} from '../../../src/normalization/UnitHarmonizer';

// ============================================================================
// Test Fixtures
// ============================================================================

const createMockExchangeRates = (): ExchangeRate[] => [
  {
    sourceCurrency: 'EUR',
    targetCurrency: 'USD',
    rate: '1.1000',
    effectiveDate: '2024-01-01T00:00:00.000Z',
  },
  {
    sourceCurrency: 'GBP',
    targetCurrency: 'USD',
    rate: '1.2500',
    effectiveDate: '2024-01-01T00:00:00.000Z',
  },
  {
    sourceCurrency: 'JPY',
    targetCurrency: 'USD',
    rate: '0.0067',
    effectiveDate: '2024-01-01T00:00:00.000Z',
  },
  {
    sourceCurrency: 'CAD',
    targetCurrency: 'USD',
    rate: '0.7500',
    effectiveDate: '2024-01-01T00:00:00.000Z',
  },
  {
    sourceCurrency: 'CHF',
    targetCurrency: 'EUR',
    rate: '1.0500',
    effectiveDate: '2024-01-01T00:00:00.000Z',
  },
  // Older rate that should be superseded
  {
    sourceCurrency: 'EUR',
    targetCurrency: 'USD',
    rate: '1.0500',
    effectiveDate: '2023-06-01T00:00:00.000Z',
  },
];

// ============================================================================
// Test Suite
// ============================================================================

describe('UnitHarmonizer', () => {
  let harmonizer: UnitHarmonizer;
  let exchangeRates: ExchangeRate[];

  beforeEach(() => {
    exchangeRates = createMockExchangeRates();
    harmonizer = new UnitHarmonizer(exchangeRates, 'USD');
  });

  // ============================================================================
  // Currency Conversion Tests
  // ============================================================================

  describe('convertToBaseCurrency', () => {
    it('should convert EUR to USD using direct rate', () => {
      const result = harmonizer.convertToBaseCurrency('100.00', 'EUR');
      expect(result.originalAmount).toBe('100.00');
      expect(result.originalCurrency).toBe('EUR');
      expect(result.targetCurrency).toBe('USD');
      expect(result.convertedAmount).toBe('110.0000');
      expect(result.exchangeRate).toBe('1.1000');
    });

    it('should return same amount when converting USD to USD', () => {
      const result = harmonizer.convertToBaseCurrency('100.00', 'USD');
      expect(result.originalAmount).toBe('100.00');
      expect(result.convertedAmount).toBe('100.00');
      expect(result.exchangeRate).toBe('1.0000');
    });

    it('should convert GBP to USD correctly', () => {
      const result = harmonizer.convertToBaseCurrency('80.00', 'GBP');
      expect(result.convertedAmount).toBe('100.0000');
    });

    it('should handle small amounts with precision', () => {
      const result = harmonizer.convertToBaseCurrency('0.01', 'EUR');
      expect(result.convertedAmount).toBe('0.0110');
    });

    it('should handle large amounts', () => {
      const result = harmonizer.convertToBaseCurrency('1000000.00', 'EUR');
      expect(result.convertedAmount).toBe('1100000.0000');
    });
  });

  describe('convertCurrency', () => {
    it('should convert between two currencies using direct rate', () => {
      const result = harmonizer.convertCurrency('100.00', 'EUR', 'USD');
      expect(result.convertedAmount).toBe('110.0000');
    });

    it('should convert using inverse rate when direct not available', () => {
      const result = harmonizer.convertCurrency('110.00', 'USD', 'EUR');
      // USD to EUR should use inverse of EUR to USD (1/1.1)
      expect(parseFloat(result.convertedAmount)).toBeCloseTo(100, 2);
    });

    it('should triangulate through base currency when needed', () => {
      // CHF -> EUR -> USD
      const result = harmonizer.convertCurrency('100.00', 'CHF', 'USD');
      // 100 CHF * 1.05 = 105 EUR * 1.10 = 115.50 USD
      expect(parseFloat(result.convertedAmount)).toBeCloseTo(115.5, 2);
    });

    it('should return same amount for same currency conversion', () => {
      const result = harmonizer.convertCurrency('100.00', 'EUR', 'EUR');
      expect(result.convertedAmount).toBe('100.00');
      expect(result.exchangeRate).toBe('1.0000');
    });

    it('should throw error when no rate path exists', () => {
      expect(() => {
        harmonizer.convertCurrency('100.00', 'XYZ', 'USD');
      }).toThrow('No exchange rate found');
    });

    it('should handle decimal precision correctly', () => {
      const result = harmonizer.convertCurrency('100.1234', 'EUR', 'USD');
      // 100.1234 * 1.1 = 110.13574
      expect(result.convertedAmount).toBe('110.1357');
    });
  });

  describe('getExchangeRate', () => {
    it('should return direct exchange rate', () => {
      const rate = harmonizer.getExchangeRate('EUR', 'USD');
      expect(rate).toBe('1.1000');
    });

    it('should return 1.0000 for same currency', () => {
      const rate = harmonizer.getExchangeRate('USD', 'USD');
      expect(rate).toBe('1.0000');
    });

    it('should return inverse rate when direct not available', () => {
      const rate = harmonizer.getExchangeRate('USD', 'EUR');
      expect(parseFloat(rate!)).toBeCloseTo(0.9091, 3);
    });

    it('should return undefined when no rate exists', () => {
      const rate = harmonizer.getExchangeRate('XYZ', 'ABC');
      expect(rate).toBeUndefined();
    });
  });

  describe('canConvert', () => {
    it('should return true for direct conversion', () => {
      expect(harmonizer.canConvert('EUR', 'USD')).toBe(true);
    });

    it('should return true for inverse conversion', () => {
      expect(harmonizer.canConvert('USD', 'EUR')).toBe(true);
    });

    it('should return true for same currency', () => {
      expect(harmonizer.canConvert('USD', 'USD')).toBe(true);
    });

    it('should return false for unavailable conversion', () => {
      expect(harmonizer.canConvert('XYZ', 'ABC')).toBe(false);
    });
  });

  // ============================================================================
  // Time Unit Conversion Tests
  // ============================================================================

  describe('convertTime', () => {
    it('should return same value for same unit', () => {
      const result = harmonizer.convertTime(10, TimeUnit.HOURS, TimeUnit.HOURS);
      expect(result.convertedValue).toBe(10);
      expect(result.conversionFactor).toBe(1);
    });

    it('should convert hours to minutes', () => {
      const result = harmonizer.convertTime(2, TimeUnit.HOURS, TimeUnit.MINUTES);
      expect(result.convertedValue).toBe(120);
      expect(result.conversionFactor).toBe(60);
    });

    it('should convert days to hours', () => {
      const result = harmonizer.convertTime(1, TimeUnit.DAYS, TimeUnit.HOURS);
      expect(result.convertedValue).toBe(24);
    });

    it('should convert weeks to days', () => {
      const result = harmonizer.convertTime(2, TimeUnit.WEEKS, TimeUnit.DAYS);
      expect(result.convertedValue).toBe(14);
    });

    it('should convert months to days', () => {
      const result = harmonizer.convertTime(1, TimeUnit.MONTHS, TimeUnit.DAYS);
      expect(result.convertedValue).toBe(30);
    });

    it('should convert years to months', () => {
      const result = harmonizer.convertTime(1, TimeUnit.YEARS, TimeUnit.MONTHS);
      expect(result.convertedValue).toBeCloseTo(12.17, 1);
    });

    it('should convert quarters to months', () => {
      const result = harmonizer.convertTime(1, TimeUnit.QUARTERS, TimeUnit.MONTHS);
      expect(result.convertedValue).toBeCloseTo(3.03, 1);
    });

    it('should convert minutes to hours', () => {
      const result = harmonizer.convertTime(120, TimeUnit.MINUTES, TimeUnit.HOURS);
      expect(result.convertedValue).toBe(2);
    });

    it('should handle fractional conversions', () => {
      const result = harmonizer.convertTime(90, TimeUnit.MINUTES, TimeUnit.HOURS);
      expect(result.convertedValue).toBe(1.5);
    });
  });

  describe('convertToWorkingHours', () => {
    it('should convert days to working hours (8h/day)', () => {
      const hours = harmonizer.convertToWorkingHours(1, TimeUnit.DAYS);
      expect(hours).toBe(8);
    });

    it('should convert weeks to working hours (40h/week)', () => {
      const hours = harmonizer.convertToWorkingHours(1, TimeUnit.WEEKS);
      expect(hours).toBe(40);
    });

    it('should convert months to working hours (160h/month)', () => {
      const hours = harmonizer.convertToWorkingHours(1, TimeUnit.MONTHS);
      expect(hours).toBe(160);
    });

    it('should convert years to working hours (1920h/year)', () => {
      const hours = harmonizer.convertToWorkingHours(1, TimeUnit.YEARS);
      expect(hours).toBe(1920);
    });

    it('should handle fractional values', () => {
      const hours = harmonizer.convertToWorkingHours(0.5, TimeUnit.DAYS);
      expect(hours).toBe(4);
    });
  });

  describe('convertFromWorkingHours', () => {
    it('should convert working hours to days', () => {
      const days = harmonizer.convertFromWorkingHours(8, TimeUnit.DAYS);
      expect(days).toBe(1);
    });

    it('should convert working hours to weeks', () => {
      const weeks = harmonizer.convertFromWorkingHours(40, TimeUnit.WEEKS);
      expect(weeks).toBe(1);
    });

    it('should convert working hours to months', () => {
      const months = harmonizer.convertFromWorkingHours(320, TimeUnit.MONTHS);
      expect(months).toBe(2);
    });
  });

  describe('standardizeToMonths', () => {
    it('should convert years to months', () => {
      const months = harmonizer.standardizeToMonths(1, TimeUnit.YEARS);
      expect(months).toBeCloseTo(12.17, 1);
    });

    it('should convert quarters to months', () => {
      const months = harmonizer.standardizeToMonths(4, TimeUnit.QUARTERS);
      expect(months).toBeCloseTo(12.13, 1);
    });

    it('should keep months as-is', () => {
      const months = harmonizer.standardizeToMonths(6, TimeUnit.MONTHS);
      expect(months).toBe(6);
    });

    it('should convert weeks to months', () => {
      const months = harmonizer.standardizeToMonths(4, TimeUnit.WEEKS);
      expect(months).toBeCloseTo(0.93, 1);
    });
  });

  describe('humanizeTime', () => {
    it('should return years for very large durations', () => {
      const ms = 400 * 24 * 60 * 60 * 1000; // 400 days
      const result = harmonizer.humanizeTime(ms);
      expect(result.unit).toBe(TimeUnit.YEARS);
    });

    it('should return months for medium-large durations', () => {
      const ms = 45 * 24 * 60 * 60 * 1000; // 45 days
      const result = harmonizer.humanizeTime(ms);
      expect(result.unit).toBe(TimeUnit.MONTHS);
    });

    it('should return weeks for week-scale durations', () => {
      const ms = 10 * 24 * 60 * 60 * 1000; // 10 days
      const result = harmonizer.humanizeTime(ms);
      expect(result.unit).toBe(TimeUnit.WEEKS);
    });

    it('should return days for day-scale durations', () => {
      const ms = 3 * 24 * 60 * 60 * 1000; // 3 days
      const result = harmonizer.humanizeTime(ms);
      expect(result.unit).toBe(TimeUnit.DAYS);
    });

    it('should return hours for hour-scale durations', () => {
      const ms = 5 * 60 * 60 * 1000; // 5 hours
      const result = harmonizer.humanizeTime(ms);
      expect(result.unit).toBe(TimeUnit.HOURS);
    });

    it('should return minutes for minute-scale durations', () => {
      const ms = 30 * 60 * 1000; // 30 minutes
      const result = harmonizer.humanizeTime(ms);
      expect(result.unit).toBe(TimeUnit.MINUTES);
    });

    it('should return seconds for second-scale durations', () => {
      const ms = 30 * 1000; // 30 seconds
      const result = harmonizer.humanizeTime(ms);
      expect(result.unit).toBe(TimeUnit.SECONDS);
    });

    it('should return milliseconds for very small durations', () => {
      const ms = 500; // 500 ms
      const result = harmonizer.humanizeTime(ms);
      expect(result.unit).toBe(TimeUnit.MILLISECONDS);
      expect(result.value).toBe(500);
    });
  });

  // ============================================================================
  // Quantity Conversion Tests
  // ============================================================================

  describe('convertQuantity', () => {
    it('should return same value for same unit', () => {
      const result = harmonizer.convertQuantity('100', QuantityUnit.UNITS, QuantityUnit.UNITS);
      expect(result.convertedValue).toBe('100');
      expect(result.conversionFactor).toBe('1');
    });

    it('should convert units to thousands', () => {
      const result = harmonizer.convertQuantity('5000', QuantityUnit.UNITS, QuantityUnit.THOUSANDS);
      expect(result.convertedValue).toBe('5.0000');
    });

    it('should convert thousands to millions', () => {
      const result = harmonizer.convertQuantity('1500', QuantityUnit.THOUSANDS, QuantityUnit.MILLIONS);
      expect(result.convertedValue).toBe('1.5000');
    });

    it('should convert GB to TB', () => {
      const result = harmonizer.convertQuantity('2048', QuantityUnit.GB, QuantityUnit.TB);
      expect(result.convertedValue).toBe('2.0000');
    });

    it('should convert TB to PB', () => {
      const result = harmonizer.convertQuantity('1024', QuantityUnit.TB, QuantityUnit.PB);
      expect(result.convertedValue).toBe('1.0000');
    });

    it('should convert PB to GB', () => {
      const result = harmonizer.convertQuantity('1', QuantityUnit.PB, QuantityUnit.GB);
      expect(result.convertedValue).toBe('1048576.0000');
    });

    it('should convert FTE to FTE_MONTHS', () => {
      const result = harmonizer.convertQuantity('1', QuantityUnit.FTE, QuantityUnit.FTE_MONTHS);
      // 1 FTE / 0.0833333 = ~12 FTE-months
      expect(parseFloat(result.convertedValue)).toBeCloseTo(12, 0);
    });
  });

  describe('normalizeQuantity', () => {
    it('should normalize thousands to base units', () => {
      const result = harmonizer.normalizeQuantity('5', QuantityUnit.THOUSANDS);
      expect(result.toNumber()).toBe(5000);
    });

    it('should normalize millions to base units', () => {
      const result = harmonizer.normalizeQuantity('2.5', QuantityUnit.MILLIONS);
      expect(result.toNumber()).toBe(2500000);
    });

    it('should keep base units as-is', () => {
      const result = harmonizer.normalizeQuantity('100', QuantityUnit.UNITS);
      expect(result.toNumber()).toBe(100);
    });

    it('should normalize TB to GB equivalent', () => {
      const result = harmonizer.normalizeQuantity('1', QuantityUnit.TB);
      expect(result.toNumber()).toBe(1024);
    });
  });

  describe('fteToHours', () => {
    it('should convert FTE to hours using default annual hours', () => {
      const hours = harmonizer.fteToHours('1');
      expect(hours).toBe('1920.0000');
    });

    it('should convert FTE to hours using custom annual hours', () => {
      const hours = harmonizer.fteToHours('1', 2000);
      expect(hours).toBe('2000.0000');
    });

    it('should handle fractional FTE', () => {
      const hours = harmonizer.fteToHours('0.5');
      expect(hours).toBe('960.0000');
    });
  });

  describe('hoursToFte', () => {
    it('should convert hours to FTE using default annual hours', () => {
      const fte = harmonizer.hoursToFte('1920');
      expect(fte).toBe('1.0000');
    });

    it('should convert hours to FTE using custom annual hours', () => {
      const fte = harmonizer.hoursToFte('2000', 2000);
      expect(fte).toBe('1.0000');
    });

    it('should handle partial FTE', () => {
      const fte = harmonizer.hoursToFte('960');
      expect(fte).toBe('0.5000');
    });
  });

  // ============================================================================
  // Unit String Parsing Tests
  // ============================================================================

  describe('parseTimeUnit', () => {
    it('should parse various time unit strings', () => {
      expect(harmonizer.parseTimeUnit('ms')).toBe(TimeUnit.MILLISECONDS);
      expect(harmonizer.parseTimeUnit('milliseconds')).toBe(TimeUnit.MILLISECONDS);
      expect(harmonizer.parseTimeUnit('s')).toBe(TimeUnit.SECONDS);
      expect(harmonizer.parseTimeUnit('sec')).toBe(TimeUnit.SECONDS);
      expect(harmonizer.parseTimeUnit('seconds')).toBe(TimeUnit.SECONDS);
      expect(harmonizer.parseTimeUnit('m')).toBe(TimeUnit.MINUTES);
      expect(harmonizer.parseTimeUnit('min')).toBe(TimeUnit.MINUTES);
      expect(harmonizer.parseTimeUnit('minutes')).toBe(TimeUnit.MINUTES);
      expect(harmonizer.parseTimeUnit('h')).toBe(TimeUnit.HOURS);
      expect(harmonizer.parseTimeUnit('hr')).toBe(TimeUnit.HOURS);
      expect(harmonizer.parseTimeUnit('hours')).toBe(TimeUnit.HOURS);
      expect(harmonizer.parseTimeUnit('d')).toBe(TimeUnit.DAYS);
      expect(harmonizer.parseTimeUnit('days')).toBe(TimeUnit.DAYS);
      expect(harmonizer.parseTimeUnit('w')).toBe(TimeUnit.WEEKS);
      expect(harmonizer.parseTimeUnit('wk')).toBe(TimeUnit.WEEKS);
      expect(harmonizer.parseTimeUnit('weeks')).toBe(TimeUnit.WEEKS);
      expect(harmonizer.parseTimeUnit('mo')).toBe(TimeUnit.MONTHS);
      expect(harmonizer.parseTimeUnit('months')).toBe(TimeUnit.MONTHS);
      expect(harmonizer.parseTimeUnit('q')).toBe(TimeUnit.QUARTERS);
      expect(harmonizer.parseTimeUnit('qtr')).toBe(TimeUnit.QUARTERS);
      expect(harmonizer.parseTimeUnit('quarters')).toBe(TimeUnit.QUARTERS);
      expect(harmonizer.parseTimeUnit('y')).toBe(TimeUnit.YEARS);
      expect(harmonizer.parseTimeUnit('yr')).toBe(TimeUnit.YEARS);
      expect(harmonizer.parseTimeUnit('years')).toBe(TimeUnit.YEARS);
    });

    it('should be case insensitive', () => {
      expect(harmonizer.parseTimeUnit('HOURS')).toBe(TimeUnit.HOURS);
      expect(harmonizer.parseTimeUnit('Hours')).toBe(TimeUnit.HOURS);
    });

    it('should trim whitespace', () => {
      expect(harmonizer.parseTimeUnit('  hours  ')).toBe(TimeUnit.HOURS);
    });

    it('should throw for unknown unit', () => {
      expect(() => harmonizer.parseTimeUnit('unknown')).toThrow('Unknown time unit');
    });
  });

  describe('parseQuantityUnit', () => {
    it('should parse various quantity unit strings', () => {
      expect(harmonizer.parseQuantityUnit('unit')).toBe(QuantityUnit.UNITS);
      expect(harmonizer.parseQuantityUnit('units')).toBe(QuantityUnit.UNITS);
      expect(harmonizer.parseQuantityUnit('k')).toBe(QuantityUnit.THOUSANDS);
      expect(harmonizer.parseQuantityUnit('thousand')).toBe(QuantityUnit.THOUSANDS);
      expect(harmonizer.parseQuantityUnit('m')).toBe(QuantityUnit.MILLIONS);
      expect(harmonizer.parseQuantityUnit('million')).toBe(QuantityUnit.MILLIONS);
      expect(harmonizer.parseQuantityUnit('b')).toBe(QuantityUnit.BILLIONS);
      expect(harmonizer.parseQuantityUnit('billion')).toBe(QuantityUnit.BILLIONS);
      expect(harmonizer.parseQuantityUnit('fte')).toBe(QuantityUnit.FTE);
      expect(harmonizer.parseQuantityUnit('fte-hours')).toBe(QuantityUnit.FTE_HOURS);
      expect(harmonizer.parseQuantityUnit('fte-months')).toBe(QuantityUnit.FTE_MONTHS);
      expect(harmonizer.parseQuantityUnit('compute-hours')).toBe(QuantityUnit.COMPUTE_HOURS);
      expect(harmonizer.parseQuantityUnit('compute_hours')).toBe(QuantityUnit.COMPUTE_HOURS);
      expect(harmonizer.parseQuantityUnit('gb')).toBe(QuantityUnit.GB);
      expect(harmonizer.parseQuantityUnit('gigabyte')).toBe(QuantityUnit.GB);
      expect(harmonizer.parseQuantityUnit('tb')).toBe(QuantityUnit.TB);
      expect(harmonizer.parseQuantityUnit('terabyte')).toBe(QuantityUnit.TB);
      expect(harmonizer.parseQuantityUnit('pb')).toBe(QuantityUnit.PB);
      expect(harmonizer.parseQuantityUnit('petabyte')).toBe(QuantityUnit.PB);
      expect(harmonizer.parseQuantityUnit('license')).toBe(QuantityUnit.LICENSES);
      expect(harmonizer.parseQuantityUnit('licenses')).toBe(QuantityUnit.LICENSES);
    });

    it('should be case insensitive', () => {
      expect(harmonizer.parseQuantityUnit('GB')).toBe(QuantityUnit.GB);
      expect(harmonizer.parseQuantityUnit('Gb')).toBe(QuantityUnit.GB);
    });

    it('should throw for unknown unit', () => {
      expect(() => harmonizer.parseQuantityUnit('unknown')).toThrow('Unknown quantity unit');
    });
  });

  // ============================================================================
  // Utility Methods Tests
  // ============================================================================

  describe('getBaseCurrency', () => {
    it('should return the base currency', () => {
      expect(harmonizer.getBaseCurrency()).toBe('USD');
    });

    it('should return correct base currency when initialized with different currency', () => {
      const eurHarmonizer = new UnitHarmonizer(exchangeRates, 'EUR');
      expect(eurHarmonizer.getBaseCurrency()).toBe('EUR');
    });
  });

  describe('getAvailableRates', () => {
    it('should return all exchange rates', () => {
      const rates = harmonizer.getAvailableRates();
      expect(rates.length).toBeGreaterThan(0);
    });

    it('should return rates in sorted order', () => {
      const rates = harmonizer.getAvailableRates();
      for (let i = 1; i < rates.length; i++) {
        const prevKey = `${rates[i - 1]?.sourceCurrency}-${rates[i - 1]?.targetCurrency}`;
        const currKey = `${rates[i]?.sourceCurrency}-${rates[i]?.targetCurrency}`;
        expect(prevKey <= currKey).toBe(true);
      }
    });

    it('should keep most recent rate for duplicate pairs', () => {
      const rates = harmonizer.getAvailableRates();
      const eurUsdRate = rates.find(r => r.sourceCurrency === 'EUR' && r.targetCurrency === 'USD');
      expect(eurUsdRate?.rate).toBe('1.1000'); // More recent rate
      expect(eurUsdRate?.effectiveDate).toBe('2024-01-01T00:00:00.000Z');
    });
  });

  describe('getAvailableCurrencies', () => {
    it('should return all available currencies', () => {
      const currencies = harmonizer.getAvailableCurrencies();
      expect(currencies).toContain('USD');
      expect(currencies).toContain('EUR');
      expect(currencies).toContain('GBP');
      expect(currencies).toContain('JPY');
      expect(currencies).toContain('CAD');
      expect(currencies).toContain('CHF');
    });

    it('should return currencies in sorted order', () => {
      const currencies = harmonizer.getAvailableCurrencies();
      for (let i = 1; i < currencies.length; i++) {
        expect(currencies[i - 1]! <= currencies[i]!).toBe(true);
      }
    });
  });

  // ============================================================================
  // Edge Cases and Error Handling
  // ============================================================================

  describe('edge cases', () => {
    it('should handle empty exchange rates array', () => {
      const emptyHarmonizer = new UnitHarmonizer([], 'USD');
      expect(emptyHarmonizer.getAvailableRates()).toEqual([]);
      expect(emptyHarmonizer.canConvert('USD', 'USD')).toBe(true);
      expect(emptyHarmonizer.canConvert('EUR', 'USD')).toBe(false);
    });

    it('should handle zero amount conversion', () => {
      const result = harmonizer.convertCurrency('0', 'EUR', 'USD');
      expect(result.convertedAmount).toBe('0.0000');
    });

    it('should handle negative amount conversion', () => {
      const result = harmonizer.convertCurrency('-100.00', 'EUR', 'USD');
      expect(result.convertedAmount).toBe('-110.0000');
    });

    it('should handle very small decimal amounts', () => {
      const result = harmonizer.convertCurrency('0.0001', 'EUR', 'USD');
      expect(parseFloat(result.convertedAmount)).toBeCloseTo(0.00011, 5);
    });

    it('should handle zero time conversion', () => {
      const result = harmonizer.convertTime(0, TimeUnit.HOURS, TimeUnit.MINUTES);
      expect(result.convertedValue).toBe(0);
    });

    it('should handle zero quantity conversion', () => {
      const result = harmonizer.convertQuantity('0', QuantityUnit.UNITS, QuantityUnit.THOUSANDS);
      expect(result.convertedValue).toBe('0.0000');
    });
  });

  // ============================================================================
  // Fiscal Calendar Integration Placeholder
  // ============================================================================

  describe('fiscal calendar alignment (placeholder)', () => {
    it('should use most recent effective rate', () => {
      // The harmonizer should have selected the 2024 rate over the 2023 rate
      const rate = harmonizer.getExchangeRate('EUR', 'USD');
      expect(rate).toBe('1.1000');
    });
  });
});
