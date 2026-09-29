'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { useParams } from 'next/navigation'
import { buildConventionClauses, buildConventionSummary } from '@/lib/shared/convention-content'

interface PublicConvention {
  id: string
  title: string
  activityLabel: string
  dayTimeLabel: string
  pricePerSession: number
  groupSize: number
  maxParticipants: number
  version: string
  versionDate: string
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function ConventionSignaturePage() {
  const params = useParams<{ id: string }>()
  const [convention, setConvention] = useState<PublicConvention | null>(null)
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading')

  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [agree, setAgree] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [status, setStatus] = useState<{ msg: string; kind: 'ok' | 'err' | '' }>({ msg: '', kind: '' })

  useEffect(() => {
    let cancelled = false
    fetch(`/api/conventions/${params.id}/public`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('not found'))))
      .then((data) => { if (!cancelled) { setConvention(data); setLoadState('ready') } })
      .catch(() => { if (!cancelled) setLoadState('error') })
    return () => { cancelled = true }
  }, [params.id])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!firstName.trim() || !lastName.trim() || !email.trim() || !phone.trim()) {
      setStatus({ msg: 'Remplissez tous les champs pour continuer.', kind: 'err' }); return
    }
    if (!EMAIL_RE.test(email.trim())) {
      setStatus({ msg: 'L\'adresse e-mail n\'est pas valide.', kind: 'err' }); return
    }
    if (!agree) {
      setStatus({ msg: 'Cochez la case d\'acceptation pour continuer.', kind: 'err' }); return
    }

    setSubmitting(true)
    setStatus({ msg: 'Enregistrement en cours…', kind: '' })
    try {
      const res = await fetch(`/api/conventions/${params.id}/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: firstName.trim(), lastName: lastName.trim(),
          email: email.trim(), phone: phone.trim(), agree: true,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'L\'enregistrement a échoué.')
      setDone(true)
      setStatus({
        msg: `Convention acceptée le ${new Date().toLocaleString('fr-CH')}. Une copie PDF vous a été envoyée par e-mail.`,
        kind: 'ok',
      })
    } catch (err) {
      setStatus({ msg: (err as Error).message || 'L\'enregistrement a échoué. Réessayez ou contactez le studio.', kind: 'err' })
    } finally {
      setSubmitting(false)
    }
  }

  if (loadState === 'loading') {
    return <div className="convention-doc"><div className="wrap"><p>Chargement…</p></div><ConventionStyles /></div>
  }
  if (loadState === 'error' || !convention) {
    return (
      <div className="convention-doc">
        <div className="wrap">
          <p className="sub">Cette convention n&apos;est plus disponible. Contactez le studio si vous pensez qu&apos;il s&apos;agit d&apos;une erreur.</p>
        </div>
        <ConventionStyles />
      </div>
    )
  }

  const summary = buildConventionSummary(convention)
  const clauses = buildConventionClauses(convention)

  return (
    <div className="convention-doc">
      <div className="wrap">
        <header>
          <p className="brand">Bis Repetita</p>
          <h1>Convention de groupe</h1>
          <p className="sub">{convention.activityLabel} — {convention.dayTimeLabel}</p>
          <p className="version">Version {convention.version} du {convention.versionDate}</p>
        </header>

        <div className="layout">
          <main>
            <section className="summary" aria-labelledby="resume">
              <h2 id="resume">Résumé des conditions</h2>
              <dl>
                {summary.map((row) => (
                  <div key={row.label} className="summary-row">
                    <dt>{row.label}</dt>
                    <dd>{row.value}</dd>
                  </div>
                ))}
              </dl>
            </section>

            <article aria-labelledby="conditions">
              <h2 id="conditions">Conditions</h2>
              {clauses.map((clause) => (
                <section className="clause" key={clause.n}>
                  <span className="n">{clause.n}</span>
                  <div>
                    <h3>{clause.title}</h3>
                    {clause.paragraphs.map((p, i) => <p key={i}>{p}</p>)}
                    {clause.example && <p className="example">{clause.example}</p>}
                  </div>
                </section>
              ))}
            </article>
          </main>

          <aside>
            <form onSubmit={handleSubmit} noValidate>
              <h2>Accepter la convention</h2>
              <div className="field">
                <label htmlFor="firstname">Prénom</label>
                <input id="firstname" autoComplete="given-name" required disabled={done}
                  value={firstName} onChange={(e) => setFirstName(e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="lastname">Nom</label>
                <input id="lastname" autoComplete="family-name" required disabled={done}
                  value={lastName} onChange={(e) => setLastName(e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="email">E-mail</label>
                <input id="email" type="email" autoComplete="email" required disabled={done}
                  value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="phone">Téléphone</label>
                <input id="phone" type="tel" autoComplete="tel" required disabled={done}
                  value={phone} onChange={(e) => setPhone(e.target.value)} />
              </div>
              <div className="check">
                <input id="agree" type="checkbox" required disabled={done}
                  checked={agree} onChange={(e) => setAgree(e.target.checked)} />
                <label htmlFor="agree">J&apos;ai lu la convention de groupe (version {convention.version}) et j&apos;en accepte les conditions, notamment que toute séance facturée est due.</label>
              </div>
              <button type="submit" disabled={submitting || done}>
                {done ? 'Convention acceptée' : submitting ? 'Enregistrement…' : 'Accepter la convention'}
              </button>
              <button type="button" className="secondary no-print" onClick={() => window.print()}>
                Imprimer ou enregistrer en PDF
              </button>
              {status.msg && <p className={`status ${status.kind}`} role="status" aria-live="polite">{status.msg}</p>}
              {!done && <p className="note">Une copie de la convention vous est envoyée par e-mail après votre acceptation.</p>}
            </form>
          </aside>
        </div>

        <footer>Bis Repetita Sàrl · La Voie-Creuse 16 · 1202 Genève</footer>
      </div>
      <ConventionStyles />
    </div>
  )
}

function ConventionStyles() {
  return (
    <style jsx global>{`
      .convention-doc {
        --stone: #E4DFD8; --paper: #F1EEE9; --ink: #2B2825; --ink-soft: #5C5650;
        --rule: #C8C0B5; --leather: #7E6450; --olive: #56624A; --alert: #9A3F2F;
        --rsm: 4px; --rlg: 10px;
        background: var(--stone);
        color: var(--ink);
        font-family: "Jost", "Futura", "Century Gothic", "Avenir Next", system-ui, sans-serif;
        font-size: 1.0625rem;
        line-height: 1.6;
        min-height: 100dvh;
        -webkit-font-smoothing: antialiased;
      }
      @media (prefers-color-scheme: dark) {
        .convention-doc {
          --stone: #1F1D1B; --paper: #292623; --ink: #ECE7E0; --ink-soft: #B2AAA0;
          --rule: #4A443E; --leather: #C9A58A; --olive: #A5B48F; --alert: #E08C7A;
        }
      }
      .convention-doc *, .convention-doc *::before, .convention-doc *::after { box-sizing: border-box; }
      .convention-doc .wrap { max-width: 72rem; margin: 0 auto; padding: 3rem 1.5rem 5rem; }
      .convention-doc header { border-bottom: 2px solid var(--ink); padding-bottom: 2rem; margin-bottom: 3rem; }
      .convention-doc .brand { font-weight: 600; letter-spacing: .02em; font-size: 1rem; margin: 0 0 2.5rem; }
      .convention-doc h1 {
        font-weight: 500; font-size: clamp(2.2rem, 6vw, 4.2rem); line-height: 1.02;
        letter-spacing: -.02em; margin: 0 0 1rem; max-width: 14ch;
      }
      .convention-doc .sub { font-size: 1.25rem; color: var(--ink-soft); margin: 0; }
      .convention-doc .version { font-size: .875rem; color: var(--ink-soft); margin: 1.25rem 0 0; }
      .convention-doc .layout { display: grid; gap: 3rem; }
      @media (min-width: 900px) {
        .convention-doc .layout { grid-template-columns: minmax(0, 1fr) 22rem; align-items: start; }
        .convention-doc aside { position: sticky; top: 1.5rem; }
      }
      .convention-doc .summary {
        background: var(--paper); border-left: 4px solid var(--leather);
        border-radius: 0 var(--rlg) var(--rlg) 0; padding: 1.5rem 1.75rem; margin-bottom: 3rem;
      }
      .convention-doc .summary h2 { margin-top: 0; }
      .convention-doc .summary dl { margin: 0; display: grid; gap: .9rem; }
      .convention-doc .summary-row dt { font-weight: 600; }
      .convention-doc .summary-row dd { margin: 0; color: var(--ink-soft); }
      @media (min-width: 640px) {
        .convention-doc .summary-row { display: grid; grid-template-columns: 11rem 1fr; gap: .9rem 1.5rem; }
      }
      .convention-doc h2 { font-weight: 500; font-size: 1.6rem; letter-spacing: -.01em; margin: 0 0 1.25rem; }
      .convention-doc article { max-width: 42rem; }
      .convention-doc .clause { border-top: 1px solid var(--rule); padding: 1.5rem 0 .5rem; display: grid; gap: .25rem; }
      @media (min-width: 640px) { .convention-doc .clause { grid-template-columns: 3rem 1fr; } }
      .convention-doc .clause .n { font-weight: 600; color: var(--leather); font-variant-numeric: tabular-nums; }
      .convention-doc .clause h3 { font-size: 1.1rem; font-weight: 600; margin: 0 0 .5rem; }
      .convention-doc .clause p { margin: 0 0 1rem; max-width: 65ch; }
      .convention-doc .example { background: var(--paper); border-radius: var(--rsm); padding: .75rem 1rem; font-size: .95rem; color: var(--ink-soft); }
      .convention-doc form {
        background: var(--paper); border: 1px solid var(--rule); border-radius: var(--rlg); padding: 1.75rem;
      }
      .convention-doc form h2 { font-size: 1.35rem; }
      .convention-doc .field { margin-bottom: 1rem; }
      .convention-doc label { display: block; font-weight: 500; font-size: .95rem; margin-bottom: .3rem; }
      .convention-doc input[type="text"], .convention-doc input:not([type]), .convention-doc input[type="email"], .convention-doc input[type="tel"] {
        width: 100%; font: inherit; color: var(--ink); background: var(--stone);
        border: 1px solid var(--rule); border-radius: var(--rsm); padding: .65rem .75rem;
      }
      .convention-doc input:focus-visible, .convention-doc button:focus-visible { outline: 3px solid var(--leather); outline-offset: 2px; }
      .convention-doc .check { display: flex; gap: .7rem; align-items: flex-start; margin: 1.25rem 0; font-size: .95rem; }
      .convention-doc .check input { width: 1.2rem; height: 1.2rem; margin-top: .25rem; accent-color: var(--ink); flex-shrink: 0; }
      .convention-doc .check label { font-weight: 400; margin: 0; }
      .convention-doc button {
        font: inherit; font-weight: 600; width: 100%; background: var(--ink); color: var(--stone);
        border: 0; border-radius: var(--rsm); padding: .85rem 1rem; cursor: pointer;
      }
      .convention-doc button:disabled { opacity: .55; cursor: not-allowed; }
      .convention-doc .secondary { background: transparent; color: var(--ink); border: 1px solid var(--rule); margin-top: .75rem; font-weight: 500; }
      .convention-doc .note { font-size: .85rem; color: var(--ink-soft); margin: 1rem 0 0; }
      .convention-doc .status { margin-top: 1rem; font-size: .95rem; min-height: 1.5em; }
      .convention-doc .status.ok { color: var(--olive); font-weight: 500; }
      .convention-doc .status.err { color: var(--alert); font-weight: 500; }
      .convention-doc footer { margin-top: 4rem; padding-top: 1.5rem; border-top: 1px solid var(--rule); font-size: .875rem; color: var(--ink-soft); }
      @media print {
        .convention-doc { background: #fff; color: #000; font-size: 11pt; }
        .convention-doc aside, .convention-doc .no-print { display: none !important; }
        .convention-doc .layout { display: block; }
        .convention-doc .summary { background: none; border: 1px solid #999; }
        .convention-doc .wrap { padding: 0; }
      }
    `}</style>
  )
}
