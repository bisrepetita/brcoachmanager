import { PDFDocument, StandardFonts, rgb, type PDFPage, type PDFFont } from 'pdf-lib'
import {
  buildConventionClauses, buildConventionSummary, STUDIO_NAME,
  type ConventionContentParams,
} from '@/lib/shared/convention-content'

const PAGE_WIDTH = 595.28  // A4
const PAGE_HEIGHT = 841.89
const MARGIN = 56
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2
const INK = rgb(0.169, 0.157, 0.145)
const INK_SOFT = rgb(0.361, 0.337, 0.314)
const LEATHER = rgb(0.494, 0.392, 0.314)

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/)
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word
    if (font.widthOfTextAtSize(candidate, size) > maxWidth && current) {
      lines.push(current)
      current = word
    } else {
      current = candidate
    }
  }
  if (current) lines.push(current)
  return lines
}

class Cursor {
  doc: PDFDocument
  page: PDFPage
  y: number
  regular: PDFFont
  bold: PDFFont

  constructor(doc: PDFDocument, regular: PDFFont, bold: PDFFont) {
    this.doc = doc
    this.regular = regular
    this.bold = bold
    this.page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
    this.y = PAGE_HEIGHT - MARGIN
  }

  ensureSpace(height: number) {
    if (this.y - height < MARGIN) {
      this.page = this.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
      this.y = PAGE_HEIGHT - MARGIN
    }
  }

  text(text: string, opts: { size: number; font?: PDFFont; color?: ReturnType<typeof rgb>; gapAfter?: number; maxWidth?: number }) {
    const font = opts.font ?? this.regular
    const lines = wrapText(text, font, opts.size, opts.maxWidth ?? CONTENT_WIDTH)
    const lineHeight = opts.size * 1.4
    for (const line of lines) {
      this.ensureSpace(lineHeight)
      this.page.drawText(line, { x: MARGIN, y: this.y - opts.size, size: opts.size, font, color: opts.color ?? INK })
      this.y -= lineHeight
    }
    this.y -= opts.gapAfter ?? 0
  }

  rule(gapBefore = 10, gapAfter = 10) {
    this.ensureSpace(gapBefore + 1 + gapAfter)
    this.y -= gapBefore
    this.page.drawLine({ start: { x: MARGIN, y: this.y }, end: { x: PAGE_WIDTH - MARGIN, y: this.y }, thickness: 0.75, color: rgb(0.784, 0.753, 0.71) })
    this.y -= gapAfter
  }
}

export interface ConventionAcceptanceRecord {
  firstName: string
  lastName: string
  email: string
  phone: string
  acceptedAtLabel: string
  ip?: string
}

export async function generateConventionPdf(
  convention: ConventionContentParams & { title: string; version: string; versionDate: string },
  acceptance: ConventionAcceptanceRecord
): Promise<Buffer> {
  const doc = await PDFDocument.create()
  const regular = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const cur = new Cursor(doc, regular, bold)

  cur.text(STUDIO_NAME.toUpperCase(), { size: 9, font: bold, color: INK_SOFT, gapAfter: 14 })
  cur.text(convention.title, { size: 22, font: bold, gapAfter: 4 })
  cur.text(`Convention de groupe — ${acceptance.firstName} ${acceptance.lastName}`, { size: 12, color: INK_SOFT, gapAfter: 4 })
  cur.text(`Version ${convention.version} du ${convention.versionDate}`, { size: 9, color: INK_SOFT, gapAfter: 16 })

  // Bloc acceptation (résumé de la trace de signature)
  cur.rule(0, 8)
  cur.text('Acceptation électronique', { size: 11, font: bold, gapAfter: 4 })
  const acceptanceLines = [
    `Nom : ${acceptance.firstName} ${acceptance.lastName}`,
    `E-mail : ${acceptance.email}`,
    `Téléphone : ${acceptance.phone}`,
    `Accepté le : ${acceptance.acceptedAtLabel}`,
  ]
  for (const line of acceptanceLines) cur.text(line, { size: 10, gapAfter: 2 })
  cur.rule(10, 14)

  cur.text('Résumé des conditions', { size: 13, font: bold, gapAfter: 8 })
  for (const row of buildConventionSummary(convention)) {
    cur.text(row.label, { size: 10, font: bold, gapAfter: 1 })
    cur.text(row.value, { size: 10, color: INK_SOFT, gapAfter: 8 })
  }

  cur.rule(6, 14)
  cur.text('Conditions', { size: 13, font: bold, gapAfter: 8 })

  for (const clause of buildConventionClauses(convention)) {
    cur.text(`${clause.n}. ${clause.title}`, { size: 11.5, font: bold, color: LEATHER, gapAfter: 4 })
    for (const p of clause.paragraphs) cur.text(p, { size: 10, gapAfter: 4 })
    if (clause.example) cur.text(clause.example, { size: 9.5, color: INK_SOFT, gapAfter: 4 })
    cur.y -= 6
  }

  const bytes = await doc.save()
  return Buffer.from(bytes)
}
