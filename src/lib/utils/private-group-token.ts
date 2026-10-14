const ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789'

// Secret du lien /groupe/{token} : 16 caractères sans ambiguïté visuelle (pas de l/1, o/0) —
// ~80 bits d'entropie, impossible à deviner, mais assez court pour rester lisible dans un message.
export function generatePrivateGroupToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('')
}
