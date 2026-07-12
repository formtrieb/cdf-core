function escapeHint(s: string): string {
  return s.replace(/"/g, '&quot;');
}

export function formatProseMarker(hint: string): string {
  return `<TBD-prose hint="${escapeHint(hint)}">`;
}

export function formatNameMarker(candidates: string[], hint: string): string {
  const list = `[${candidates.map((c) => `'${c}'`).join(', ')}]`;
  return `<TBD-name candidates="${list}" hint="${escapeHint(hint)}">`;
}

export function formatClassificationMarker(candidates: string[], hint: string): string {
  const list = `[${candidates.map((c) => `'${c}'`).join(', ')}]`;
  return `<TBD-classification candidates="${list}" hint="${escapeHint(hint)}">`;
}

export interface MarkerCount {
  prose: number;
  name: number;
  classification: number;
  total: number;
}

export function parseMarkers(text: string): MarkerCount {
  const prose = (text.match(/<TBD-prose\s/g) ?? []).length;
  const name = (text.match(/<TBD-name\s/g) ?? []).length;
  const classification = (text.match(/<TBD-classification\s/g) ?? []).length;
  return { prose, name, classification, total: prose + name + classification };
}
