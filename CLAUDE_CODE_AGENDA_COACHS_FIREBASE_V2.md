# Cahier des charges Claude Code — Agenda coachs type Google Calendar

Projet : Agenda interne Bis Repetita pour coachs, admin, disponibilités, séances, paiements TWINT et suivi client.

Objectif : créer une application web mobile-first, installable sur smartphone, proche de l’expérience Google Calendar, mais adaptée à la gestion de coachs de boxe, clients, groupes, paiements et locations de salle.

Stack recommandée :
- Next.js App Router
- TypeScript
- Firebase Auth
- Firestore
- Firebase Cloud Messaging pour notifications
- Firebase Storage si besoin de fichiers
- Tailwind CSS
- shadcn/ui
- date-fns
- FullCalendar ou calendrier custom mobile-first
- PWA installable sur smartphone

Ne pas coder toute l’application d’un coup.
Claude Code doit avancer phase par phase, demander validation avant chaque grosse modification et garder le code propre, typé et maintenable.

---

## 1. Objectif fonctionnel

L’application doit permettre :

- À chaque coach d’avoir son propre calendrier
- À l’admin de voir tous les calendriers coachs
- À l’admin d’être aussi coach
- Aux coachs de créer leurs séances
- À l’admin de créer les lieux et services
- De gérer les clients et groupes de clients
- De suivre les paiements des séances
- D’envoyer un lien TWINT par WhatsApp
- De suivre les séances effectuées, annulées et offertes
- De gérer les séances récurrentes
- De gérer les disponibilités simples des coachs
- De calculer ce qu’un coach indépendant doit à Bis Repetita pour la location de salle
- D’empêcher les coachs de voir les chiffres financiers globaux

---

## 2. Rôles utilisateurs

Un utilisateur peut avoir plusieurs rôles.

### Rôles possibles

- admin
- coach

Un admin peut aussi être coach.

### Admin

L’admin peut :

- Voir tous les calendriers coachs
- Créer, modifier et supprimer les coachs
- Créer, modifier et supprimer les services
- Créer, modifier et supprimer les lieux
- Créer, modifier et supprimer les clients
- Créer, modifier et supprimer les groupes de clients
- Voir toutes les séances
- Voir les disponibilités de tous les coachs
- Voir les statuts de paiement
- Modifier manuellement les paiements
- Voir les montants
- Voir ce que chaque coach indépendant doit pour la location
- Voir les notes clients et notes de séances

### Coach

Le coach peut :

- Voir son calendrier
- Créer ses séances
- Modifier ses propres séances
- Voir les séances où il est assigné
- Voir les informations utiles des clients concernés
- Voir les notes nécessaires au bon déroulement d’une séance
- Clôturer une séance
- Marquer une séance comme faite ou annulée
- Ajouter une note de séance
- Envoyer un lien TWINT au client via WhatsApp
- Modifier un statut de paiement manuellement si autorisé
- Ajouter ses disponibilités

Le coach ne peut pas :

- Voir les chiffres globaux
- Voir les revenus totaux
- Voir les statistiques financières
- Voir ce que les autres coachs génèrent
- Modifier les services
- Modifier les lieux
- Voir les paramètres financiers sensibles

---

## 3. Design et UX

Le design ne doit pas être basique.

Direction artistique souhaitée :

- Premium
- Sobre
- Moderne
- Mobile-first
- Inspiré d’un outil professionnel type Google Calendar, Linear, Notion Calendar ou Cron
- Interface très claire sur smartphone
- Pas de dashboard chargé inutilement
- Beaucoup d’espace, hiérarchie visuelle forte
- Cartes propres
- Typographie élégante
- Interactions fluides
- Calendrier lisible même sur petit écran

### Exigences UX

Sur smartphone :

- Navigation en bas de l’écran
- Boutons larges
- Création de séance rapide
- Recherche client très rapide
- Vue jour / semaine / mois
- Vue admin avec filtres par coach
- Couleurs par coach ou par statut
- Bouton flottant pour créer une séance
- Clôture de séance en 1 clic depuis notification
- Aucun écran complexe inutilisable sur mobile

Ne pas utiliser un design générique de template admin.

---

## 4. Entités principales

### users

Champs :

- id
- firstName
- lastName
- email
- phone
- roles: array ["admin", "coach"]
- active: boolean
- color
- createdAt
- updatedAt

---

### clients

Champs :

- id
- firstName
- lastName
- address
- postalCode
- city
- email
- phone
- additionalInfo
- sessionCredits
- createdAt
- updatedAt

Notes :

- `sessionCredits` représente le nombre de séances payées restantes.
- Lorsqu’un client participe à une séance payée avec crédit, son nombre de séances restantes diminue.
- L’historique des crédits doit être conservé.

---

### clientGroups

Objectif : pouvoir ajouter rapidement plusieurs clients à une séance.

Champs :

- id
- name
- clientIds: array
- notes
- createdAt
- updatedAt

Exemple :

- Groupe enfants mercredi
- Groupe entreprise Addax
- Duo régulier

---

### locations

Créés par l’admin uniquement.

Champs :

- id
- name
- address
- notes
- active
- createdAt
- updatedAt

---

### services

Créés par l’admin uniquement.

Champs :

- id
- name
- price
- pricingMode
- independentRoomRentalPrice
- active
- createdAt
- updatedAt

### pricingMode

Valeurs possibles :

- per_person
- split_between_group

Explication :

- `per_person` : chaque client paie le prix défini
- `split_between_group` : le prix est divisé entre les participants

### independentRoomRentalPrice

Prix de location dû par un coach indépendant à Bis Repetita lorsqu’il utilise la salle.

Exemple :

- Service : Coaching privé
- Prix client : CHF 120
- Location salle indépendant : CHF 30

---

## 5. Séances

### sessions

Champs :

- id
- coachId
- clientIds
- clientGroupId optional
- locationId
- serviceId
- startAt
- endAt
- isIndependent
- recurrenceId optional
- recurrenceRule optional
- status
- paymentStatus
- paymentDistribution
- priceSnapshot
- roomRentalSnapshot
- twintLink
- whatsappMessageSentAt
- sessionNote
- createdAt
- updatedAt
- completedAt
- cancelledAt

### status

Valeurs :

- planned
- done
- cancelled

### paymentStatus

Valeurs demandées :

- payment_to_request
- link_sent
- paid
- offered
- cancelled

Labels français :

- Paiement à demander
- Lien envoyé
- Payé
- Offert
- Annulé

### priceSnapshot

Important : quand une séance est créée, copier le prix du service dans la séance.

Pourquoi :
- Si le prix du service change plus tard, les anciennes séances ne doivent pas changer.

Champs :

- serviceName
- basePrice
- pricingMode
- customTotalPrice
- customPricePerClient

### paymentDistribution

Permet de définir qui paie combien.

Cas par défaut :

- Si service.pricingMode = per_person :
  chaque client doit payer le prix du service

- Si service.pricingMode = split_between_group :
  le prix est divisé entre les clients

Avant d’envoyer le lien TWINT, l’utilisateur doit pouvoir modifier :

- le montant total
- la répartition par client
- le prix d’un client
- le client qui paie pour tout le groupe

Structure suggérée :

```ts
paymentDistribution: [
  {
    clientId: string,
    amountDue: number,
    amountPaid: number,
    paymentStatus: string,
    twintLink?: string,
    paidAt?: Timestamp
  }
]
```

### roomRentalSnapshot

Si `isIndependent = true`, calculer ce que le coach doit à Bis Repetita pour la location.

Champs :

- amountDueToCompany
- status: pending / paid / waived
- paidAt

Le coach ne doit pas voir les chiffres de synthèse, mais l’admin oui.

---

## 6. Séances récurrentes

Une séance peut être récurrente.

Exemple :

- Hebdomadaire
- Tous les mardis à 18h
- Avec le même client ou groupe
- Même lieu
- Même service

Lorsqu’on modifie une séance récurrente, proposer :

1. Modifier uniquement cette séance
2. Modifier cette séance et toutes les suivantes

Ne pas proposer “modifier toute la série passée” au début pour éviter les erreurs.

Implémentation recommandée :

- Créer une collection `recurrences`
- Chaque séance générée garde un `recurrenceId`
- Pour modifier “cette séance uniquement”, on modifie seulement le document session
- Pour modifier “celle-ci et les suivantes”, on applique la modification aux sessions futures liées au recurrenceId

---

## 7. Clôture de séance

5 minutes avant la fin d’une séance, le coach reçoit une notification.

La notification ouvre la page de clôture de séance.

### Page de clôture

La page doit permettre :

- Voir la séance
- Voir le client ou le groupe
- Voir les notes importantes du client
- Cocher “séance faite”
- Cocher “séance annulée”
- Ajouter une note de séance
- Voir le statut de paiement
- Envoyer un lien TWINT par WhatsApp
- Modifier manuellement le statut de paiement

### Fallback obligatoire

Les notifications push peuvent ne pas arriver si :

- le coach n’a pas accepté les notifications
- la PWA n’est pas installée
- le téléphone bloque les notifications

Donc prévoir aussi une page :

## Séances à clôturer

Cette page liste :

- les séances terminées mais non clôturées
- les séances du jour
- les séances avec paiement à demander
- les séances avec lien envoyé mais non payé

---

## 8. TWINT et WhatsApp

Objectif :

Depuis la page de clôture, le coach peut envoyer un lien TWINT au client via WhatsApp.

### Important

L’intégration TWINT peut être limitée selon les possibilités de TWINT Business.

Prévoir deux modes :

### Mode semi-automatique

- Générer ou saisir un lien TWINT
- Ouvrir WhatsApp avec un message prérempli
- Passer le statut à `link_sent`
- Le coach ou l’admin peut marquer comme payé manuellement

### Mode automatique futur

Si une API ou un webhook TWINT est disponible :

- Générer un lien unique par client / séance
- Recevoir confirmation de paiement
- Passer automatiquement le statut à `paid`

Ne pas bloquer le développement sur l’automatisation complète TWINT.

### Message WhatsApp

Prévoir un modèle modifiable dans les paramètres :

```text
Bonjour {prenom}, voici le lien pour le paiement de la séance du {date} : {twintLink}
```

Variables :

- {prenom}
- {nom}
- {date}
- {heure}
- {service}
- {montant}
- {twintLink}

---

## 9. Disponibilités coach

Objectif simple : savoir rapidement si un coach est disponible cette semaine lorsqu’un client demande de vive voix.

Pas besoin de règles complexes au début.

### Fonctionnement

Chaque coach peut indiquer ses disponibilités.

Vue :

- Grille par semaine
- Créneaux de 15 minutes
- Sélection facile par glisser / maintien
- Possibilité de cocher plusieurs créneaux d’un coup
- Boutons rapides :
  - matin
  - midi
  - après-midi
  - soir
  - toute la journée

### availabilitySlots

Champs :

- id
- coachId
- startAt
- endAt
- createdAt
- updatedAt

L’admin peut voir les disponibilités de tous les coachs.

Le coach voit ses disponibilités.

Pas besoin au départ de bloquer automatiquement les conflits.

Mais l’interface doit afficher clairement si un coach est déjà réservé.

---

## 10. Notes clients et confidentialité

Si un coach est réservé avec le client d’un autre coach, il doit pouvoir voir les notes utiles du client pour assurer correctement la séance.

Donc :

- Les notes client sont visibles par le coach assigné à une séance avec ce client
- Les notes ne doivent pas contenir de chiffres financiers sensibles visibles côté coach
- Prévoir éventuellement deux champs plus tard :
  - notesCoachVisible
  - notesAdminOnly

Pour le MVP, utiliser `additionalInfo`, visible aux admins et aux coachs assignés au client sur une séance.

---

## 11. Crédits / séances payées

Besoin :

Ajout de séances payées à un client.

Exemple :

- Le client achète 10 séances
- Son solde devient 10
- À chaque participation à une séance, le solde diminue de 1

### creditTransactions

Créer une collection d’historique :

- id
- clientId
- type: add / use / correction
- quantity
- sessionId optional
- note
- createdBy
- createdAt

Ne jamais modifier seulement un compteur sans historique.

`clients.sessionCredits` peut être un compteur rapide, mais l’historique officiel est dans `creditTransactions`.

Quand une séance est marquée `done`, proposer :

- utiliser 1 crédit pour ce client
- ne pas utiliser de crédit
- paiement direct TWINT
- offert

---

## 12. Paiements

Les paiements sont suivis par client dans la séance.

### Cas simples

1 client :
- montant total dû par ce client
- statut paiement du client
- lien TWINT du client

Groupe :
- soit chacun paie sa part
- soit un client paie pour tout
- soit les montants sont personnalisés

Avant envoi du lien :

- afficher la répartition
- permettre modification
- valider
- envoyer WhatsApp

Le statut global de la séance est calculé :

- tous payés = paid
- au moins un lien envoyé = link_sent
- rien envoyé = payment_to_request
- offert = offered
- annulé = cancelled

---

## 13. Sécurité Firebase

Utiliser Firebase Auth.

Firestore Security Rules obligatoires.

Règles attendues :

- Un utilisateur non connecté ne voit rien
- Admin voit tout
- Coach voit :
  - son profil
  - ses séances
  - les clients liés à ses séances
  - ses disponibilités
  - les services en lecture
  - les lieux en lecture
- Coach ne voit pas :
  - statistiques financières globales
  - revenus par coach
  - synthèse location indépendante globale
  - paramètres sensibles

Attention :
Ne jamais cacher les chiffres uniquement côté interface.
Les règles Firestore doivent empêcher l’accès.

Créer des fonctions utilitaires :

- isAdmin()
- isCoach()
- isAssignedCoach(sessionId)
- canReadClient(clientId)

---

## 14. Hors ligne

L’application doit être pratique même avec une connexion imparfaite.

Fonctionnalités hors ligne acceptables :

- Voir les séances déjà chargées
- Voir les clients récemment chargés
- Voir ses disponibilités
- Ajouter une note de séance
- Préparer une clôture de séance

Fonctionnalités nécessitant internet :

- Envoyer lien TWINT
- Envoyer WhatsApp avec lien fiable
- Synchroniser paiement
- Créer notification push
- Voir données non chargées

Si une action est faite hors ligne, afficher un état :

- “À synchroniser”
- “Synchronisation en attente”

---

## 15. Pages de l’application

### Mobile navigation

Pages principales :

1. Calendrier
2. Séances à clôturer
3. Disponibilités
4. Clients
5. Paramètres

Admin uniquement :

6. Coachs
7. Services
8. Lieux
9. Groupes
10. Suivi indépendant

---

## 16. Calendrier

### Vue coach

- Mes séances
- Mes disponibilités
- Bouton créer séance
- Filtre jour / semaine / mois
- Couleur par statut

### Vue admin

- Tous les coachs
- Filtre par coach
- Filtre par lieu
- Filtre par statut
- Vue disponibilités superposées
- Vue séances superposées

L’admin doit pouvoir répondre rapidement :

- Quel coach est disponible cette semaine ?
- Quel coach est occupé aujourd’hui ?
- Où se passe telle séance ?
- Quel client est avec quel coach ?

---

## 17. Création de séance

Formulaire mobile en étapes :

1. Coach
2. Client ou groupe
3. Service
4. Lieu
5. Date et heure
6. Indépendant ou non
7. Récurrence éventuelle
8. Vérification paiement
9. Confirmation

### Raccourcis

- Créer un client rapidement si inexistant
- Créer un groupe rapidement
- Dupliquer une séance
- Répéter la séance chaque semaine

---

## 18. Suivi indépendant

Objectif :

Voir combien un coach indépendant doit à Bis Repetita pour la location de salle.

Admin uniquement.

Affichage :

- Coach
- Période
- Nombre de séances indépendantes
- Prix location par séance
- Total dû
- Statut : à payer / payé / annulé

Le coach ne voit pas cette synthèse globale.

---

## 19. Notifications

Utiliser Firebase Cloud Messaging si possible.

Notification 5 minutes avant la fin :

Titre :
Séance bientôt terminée

Message :
Clôture la séance avec {clientName}

Action :
ouvrir /sessions/{sessionId}/close

Prévoir une alternative sans push :

- badge dans l’app
- page séances à clôturer
- rappel visuel sur le calendrier

---

## 20. Paramètres

Admin peut configurer :

- Nom de l’entreprise
- Téléphone
- Email
- Logo
- Message WhatsApp par défaut
- Durée par défaut d’une séance
- Couleurs des statuts
- Règles de paiement
- TWINT link base ou méthode de paiement utilisée

---

## 21. Ordre de développement recommandé

### Phase 1 — Setup

- Créer projet Next.js TypeScript
- Installer Tailwind + shadcn/ui
- Configurer Firebase
- Configurer Firebase Auth
- Créer layout mobile premium
- Créer navigation basique

Ne pas créer encore de logique complexe.

### Phase 2 — Auth et rôles

- Login
- Gestion roles admin / coach
- Protection des routes
- Middleware / guards
- Données utilisateur

### Phase 3 — Design system

- Couleurs
- Typographie
- Boutons
- Cards
- Modals
- Bottom navigation
- Empty states
- Loading states
- Toasts
- Mobile-first

Objectif : éviter une interface basique.

### Phase 4 — Admin setup

- CRUD coachs
- CRUD lieux
- CRUD services
- CRUD clients
- CRUD groupes

### Phase 5 — Calendrier

- Vue calendrier coach
- Vue calendrier admin
- Filtres
- Couleurs par coach / statut
- Création séance simple

### Phase 6 — Séances

- Formulaire création séance
- Séance individuelle
- Séance groupe
- Snapshot du prix
- Statuts
- Indépendant oui/non

### Phase 7 — Récurrence

- Création séance hebdomadaire
- Modification seulement cette séance
- Modification cette séance et suivantes

### Phase 8 — Clôture séance

- Page de clôture
- Statut fait / annulé
- Note de séance
- Paiement à demander
- Utilisation de crédit

### Phase 9 — Paiements et WhatsApp

- Répartition paiement
- Prix modifiable avant envoi
- Génération message WhatsApp
- Statut lien envoyé
- Statut payé manuel

### Phase 10 — Crédits clients

- Ajouter crédits
- Utiliser crédits
- Historique crédits
- Affichage solde client

### Phase 11 — Disponibilités

- Grille semaine
- Créneaux 15 minutes
- Sélection rapide
- Vue admin des disponibilités

### Phase 12 — Suivi indépendant

- Calcul location salle
- Vue admin uniquement
- Marquer location comme payée

### Phase 13 — Notifications

- FCM
- Notification 5 minutes avant fin
- Fallback page séances à clôturer

### Phase 14 — Sécurité

- Firestore rules
- Tests d’accès coach/admin
- Vérification que les coachs ne voient pas les chiffres

### Phase 15 — PWA et hors ligne

- Manifest
- Service worker
- Données récentes consultables hors ligne
- États “à synchroniser”

---

## 22. Règles importantes pour Claude Code

Claude Code doit :

1. Lire entièrement ce fichier avant de coder
2. Proposer un plan avant toute modification
3. Ne jamais coder toute l’application d’un coup
4. Travailler phase par phase
5. Lister les fichiers créés/modifiés avant modification
6. Attendre validation si demandé
7. Garder le code TypeScript strict
8. Garder une architecture claire
9. Ne pas exposer de chiffres aux coachs
10. Ne pas coder une fausse intégration TWINT automatique si elle n’est pas disponible
11. Prévoir un fallback manuel pour TWINT
12. Prioriser une UX smartphone premium
13. Tester les règles de sécurité Firestore

---

## 23. Prompt conseillé pour démarrer dans Claude Code

Copier-coller :

```text
Lis entièrement le fichier CLAUDE_CODE_AGENDA_COACHS_FIREBASE_V2.md.

Ne code rien pour l’instant.

Analyse le projet, challenge les choix techniques et métier, puis propose un plan de développement phase par phase.

Je veux une application mobile-first premium, pas une interface admin basique.

Attends ma validation avant de modifier les fichiers.
```

---

## 24. Décisions déjà validées

- Firebase plutôt que Supabase
- Application type PWA mobile-first
- Agenda proche de Google Calendar
- Chaque coach a son calendrier
- Admin voit tous les calendriers
- Admin peut aussi être coach
- Coach ne voit pas les chiffres
- Paiement TWINT avec fallback manuel
- Statut de paiement modifiable manuellement
- Groupes clients possibles
- Modification récurrence : cette séance ou toutes les suivantes
- Disponibilités simples, sans règles complexes au départ
- Notes client visibles au coach assigné à une séance avec ce client
- Suivi location salle pour indépendants visible admin uniquement
