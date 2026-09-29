/**
 * Un lector de CSV que respeta las comillas (RFC 4180): comas y saltos de
 * línea adentro de un campo entre comillas, y `""` para una comilla. Los
 * títulos traen comas —"Love, Death & Robots"— y las reseñas de Letterboxd,
 * párrafos enteros.
 */
export function parseCsv(text: string): string[][] {
  // La marca de orden de bytes con la que Excel abre bien los acentos.
  const source = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (quoted) {
      if (char === '"') {
        if (source[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && source[i + 1] === '\n') i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += char;
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  // Las líneas en blanco del final no son filas.
  return rows.filter((cells) => cells.some((cell) => cell.trim() !== ''));
}

/** Las filas como objetos, por el nombre de cada columna del encabezado. */
export function csvRecords(text: string): Record<string, string>[] {
  const [header, ...rows] = parseCsv(text);
  if (!header) return [];
  const names = header.map((name) => name.trim());
  return rows.map((cells) =>
    Object.fromEntries(names.map((name, index) => [name, (cells[index] ?? '').trim()])),
  );
}

/** Los nombres de las columnas, para reconocer de qué export es. */
export function csvHeader(text: string): string[] {
  return (parseCsv(text.split(/\r?\n/, 1)[0] ?? '')[0] ?? []).map((name) => name.trim());
}
