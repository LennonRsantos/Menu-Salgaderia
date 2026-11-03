// Address from a Brazilian CEP (ViaCEP, called from the browser). Pure, no server imports.

export interface CepAddress {
  street: string;
  neighborhood: string;
  city: string;
  state: string;
}

/** null when the CEP does not exist; network errors are thrown for the caller to ignore. */
export async function lookupCep(zip: string): Promise<CepAddress | null> {
  const digits = zip.replace(/\D/g, "");
  if (digits.length !== 8) return null;
  const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
  if (!res.ok) return null;
  const data = await res.json();
  if (data.erro) return null;
  return { street: data.logradouro ?? "", neighborhood: data.bairro ?? "", city: data.localidade ?? "", state: data.uf ?? "" };
}

/** "Rua X, 123 - Bairro, Cidade - UF"; parts left empty are skipped. */
export function formatCepAddress(a: CepAddress, number: string) {
  const street = [a.street, number.trim()].filter(Boolean).join(", ");
  const place = [a.city, a.state].filter(Boolean).join(" - ");
  return [street, [a.neighborhood, place].filter(Boolean).join(", ")].filter(Boolean).join(" - ");
}
