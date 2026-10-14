// `enrolledClientIds` dénormalise les clientId des inscriptions actives (non annulées) d'une séance
// collective : les inscriptions sont des objets dans un tableau, impossibles à requêter par
// clientId — ce champ permet `where('enrolledClientIds', 'array-contains', clientId)` (ex. fiche
// client côté coach). À écrire à CHAQUE modification de `enrollments`, via ce helper.
export function activeEnrolledClientIds(enrollments: Array<Record<string, unknown>>): string[] {
  return [...new Set(enrollments
    .filter((e) => e['status'] !== 'cancelled' && typeof e['clientId'] === 'string')
    .map((e) => e['clientId'] as string))]
}

export function enrollmentsUpdate<T extends Record<string, unknown>>(enrollments: T[]): { enrollments: T[]; enrolledClientIds: string[] } {
  return { enrollments, enrolledClientIds: activeEnrolledClientIds(enrollments) }
}
