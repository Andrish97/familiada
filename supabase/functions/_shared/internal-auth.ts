// Porównanie bajtów nagłówka i sekretu dla wewnętrznych endpointów Edge.
// Puste sekrety są odrzucane przez politykę każdego endpointu przed wywołaniem.
export function timingSafeEqual(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  let diff = ea.length ^ eb.length;
  const n = Math.max(ea.length, eb.length);
  for (let i = 0; i < n; i++) diff |= (ea[i] ?? 0) ^ (eb[i] ?? 0);
  return diff === 0;
}
