import { describe, expect, it } from 'vitest';
import { languageForRegion, parseLanguage } from './language';
import { REGIONS } from '@/preferences';

describe('languageForRegion', () => {
  it('España lee en castellano de España', () => {
    expect(languageForRegion('ES')).toBe('es-ES');
  });

  it.each(['AR', 'MX', 'CL', 'CO', 'PE', 'UY'])('%s lee en latino', (region) => {
    expect(languageForRegion(region)).toBe('es-MX');
  });

  it('las regiones de fuera de Hispanoamérica también van en latino', () => {
    // La app está en castellano: a quien la usa desde ahí le sirve el latino.
    expect(languageForRegion('BR')).toBe('es-MX');
    expect(languageForRegion('US')).toBe('es-MX');
  });

  it('cubre todas las regiones que se ofrecen', () => {
    for (const { code } of REGIONS) {
      expect(['es-ES', 'es-MX']).toContain(languageForRegion(code));
    }
  });
});

describe('parseLanguage', () => {
  it('acepta los dos idiomas que se usan', () => {
    expect(parseLanguage('es-ES')).toBe('es-ES');
    expect(parseLanguage('es-MX')).toBe('es-MX');
  });

  it.each([undefined, null, '', 'es', 'en-US', 'es-AR', 42])(
    'descarta %o',
    (value) => {
      expect(parseLanguage(value)).toBeUndefined();
    },
  );
});
