// Contenu légal des conventions de groupe — partagé entre la page publique de signature
// (src/app/convention/[id]/page.tsx) et le générateur de PDF serveur (src/lib/server/convention-pdf.ts).
// Seuls le prix, le créneau et l'activité varient d'une convention à l'autre : tout le reste
// (clauses 1, 4-12) est un texte fixe repris tel quel.

export interface ConventionContentParams {
  activityLabel: string
  dayTimeLabel: string
  pricePerSession: number
  groupSize: number
  maxParticipants: number
}

export interface ConventionClause {
  n: number
  title: string
  paragraphs: string[]
  example?: string
}

export const STUDIO_NAME = 'Bis Repetita Sàrl'
export const STUDIO_ADDRESS = 'La Voie-Creuse 16, 1202 Genève'

function roundTo5Cents(value: number): number {
  return Math.round(value * 20) / 20
}

export function formatCHF(value: number): string {
  const fixed = value.toFixed(2)
  return `CHF ${fixed.endsWith('.00') ? fixed.replace('.00', '.-') : fixed}`
}

export function pricePerPerson(pricePerSession: number, participants: number): number {
  return roundTo5Cents(pricePerSession / participants)
}

export function buildConventionSummary(p: ConventionContentParams): Array<{ label: string; value: string }> {
  return [
    { label: 'Tarif', value: `${formatCHF(p.pricePerSession)} par séance, réparti entre les participants inscrits au mois, qu'ils soient présents ou non.` },
    { label: 'Paiement', value: 'Les séances du mois sont facturées d\'avance et payables avant la première séance.' },
    { label: 'Absence', value: 'La séance reste due. Le participant peut se faire remplacer, sur annonce au moins 1 heure avant.' },
    { label: 'Annulation d\'une séance', value: 'Possible si elle est annoncée avant l\'envoi de la facture du mois concerné.' },
    { label: 'Résiliation', value: 'Par écrit avant le 20 du mois, avec effet au mois suivant.' },
  ]
}

export function buildConventionClauses(p: ConventionContentParams): ConventionClause[] {
  const priceAtGroupSize = pricePerPerson(p.pricePerSession, p.groupSize)
  const priceAtMax = pricePerPerson(p.pricePerSession, p.maxParticipants)
  const exampleParts = [`avec ${p.groupSize} participants, ${formatCHF(priceAtGroupSize)} par personne et par séance (arrondi aux 5 centimes)`]
  if (p.maxParticipants !== p.groupSize) {
    exampleParts.push(`avec ${p.maxParticipants}, ${formatCHF(priceAtMax)} par personne et par séance`)
  }

  return [
    {
      n: 1,
      title: 'Parties',
      paragraphs: [
        `La présente convention est conclue entre ${STUDIO_NAME}, ${STUDIO_ADDRESS} (ci-après « le studio »), et le participant qui l'accepte (ci-après « le participant »).`,
      ],
    },
    {
      n: 2,
      title: 'Objet',
      paragraphs: [
        `Le studio organise une séance de ${p.activityLabel} ${p.dayTimeLabel}, dans ses locaux. Le groupe compte ${p.groupSize} participants, et au maximum ${p.maxParticipants}. Le studio désigne le coach qui encadre les séances.`,
      ],
    },
    {
      n: 3,
      title: 'Tarif',
      paragraphs: [
        `Le prix d'une séance est de ${formatCHF(p.pricePerSession)} pour l'ensemble du groupe. Ce montant est divisé par le nombre de participants inscrits pour le mois concerné. La part de chaque participant est fixée au moment de la facturation. Elle ne change pas selon le nombre de personnes présentes à une séance : un participant absent paie sa part, et les autres ne paient pas davantage.`,
      ],
      example: `Exemples : ${exampleParts.join('. ')}.`,
    },
    {
      n: 4,
      title: 'Facturation et paiement',
      paragraphs: [
        'Le montant mensuel correspond au nombre de séances du mois, multiplié par la part de chaque participant. Il varie donc selon le nombre de séances prévues dans le mois.',
        'La facture du mois suivant est envoyée à la fin de chaque mois. Elle est payable avant la première séance du mois facturé. Le studio peut refuser l\'accès aux séances tant que la facture n\'est pas réglée.',
      ],
    },
    {
      n: 5,
      title: 'Annulation d\'une séance à l\'avance',
      paragraphs: [
        'Le groupe peut annuler une ou plusieurs séances à condition de l\'annoncer au studio avant l\'envoi de la facture du mois concerné. Les séances annulées ainsi ne sont pas facturées.',
      ],
    },
    {
      n: 6,
      title: 'Absences',
      paragraphs: [
        'Toute séance facturée est due, que le participant y assiste ou non. Aucune séance manquée n\'est remboursée, reportée ou créditée.',
      ],
    },
    {
      n: 7,
      title: 'Remplacement',
      paragraphs: [
        'Le participant absent peut se faire remplacer par une personne extérieure au groupe. Il annonce le nom et le prénom du remplaçant au studio au moins 1 heure avant la séance.',
        'Le studio ne gère aucun paiement avec le remplaçant. Tout arrangement financier se fait directement entre le participant et son remplaçant.',
        'Avant sa première séance, le remplaçant remplit et accepte la fiche remplaçant. Sans cette fiche, le studio peut refuser l\'accès à la séance.',
      ],
    },
    {
      n: 8,
      title: 'Annulation par le studio',
      paragraphs: [
        'Si le coach prévu est empêché, le studio fait son possible pour assurer la séance avec un coach remplaçant. Si aucun coach n\'est disponible, la séance est créditée sur la facture du mois suivant.',
      ],
    },
    {
      n: 9,
      title: 'Durée et résiliation',
      paragraphs: [
        'La convention est conclue pour un mois. Elle se renouvelle automatiquement de mois en mois.',
        'Le participant qui souhaite arrêter l\'annonce au studio par écrit (e-mail ou message) avant le 20 du mois. Il n\'est alors plus facturé dès le mois suivant. Passé le 20, le mois suivant reste dû.',
      ],
    },
    {
      n: 10,
      title: 'Santé et responsabilité',
      paragraphs: [
        `Le participant confirme être en bonne santé et apte à pratiquer cette activité. Il informe le coach de toute blessure ou problème de santé avant la séance.`,
        'Le participant doit être couvert par sa propre assurance accident. Il s\'engage à respecter le règlement du studio et les consignes du coach.',
      ],
    },
    {
      n: 11,
      title: 'Acceptation électronique',
      paragraphs: [
        'La présente convention est acceptée électroniquement. Le studio enregistre le nom du participant, son adresse e-mail, la date et l\'heure de l\'acceptation ainsi que la version des conditions acceptée. Cette acceptation a la même valeur qu\'une signature.',
      ],
    },
    {
      n: 12,
      title: 'Droit applicable et for',
      paragraphs: [
        'La présente convention est soumise au droit suisse. Le for est à Genève.',
      ],
    },
  ]
}
