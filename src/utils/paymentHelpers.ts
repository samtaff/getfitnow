import { SportEvent } from '../types';
import { formatFrenchDateLong, formatFrenchTime, formatPriceEuros } from './dateAndValidation';

export type CardBrand = 'Visa' | 'Mastercard' | 'Amex' | 'CB';

export function sanitizeCardDigits(value: string): string {
  return value.replace(/\D/g, '').slice(0, 16);
}

export function detectCardBrand(digits: string): CardBrand {
  const clean = sanitizeCardDigits(digits);
  if (/^3[47]/.test(clean)) return 'Amex';
  if (/^4/.test(clean)) return 'Visa';
  if (/^(5[1-5]|222[1-9]|22[3-9]|2[3-6]|27[01]|2720)/.test(clean)) {
    return 'Mastercard';
  }
  return 'CB';
}

export function formatCardNumberInput(value: string): string {
  const digits = sanitizeCardDigits(value);
  return digits.replace(/(\d{4})(?=\d)/g, '$1 ');
}

export function validateLuhn(digits: string): boolean {
  const clean = sanitizeCardDigits(digits);
  if (clean.length < 15 || clean.length > 16) return false;
  let sum = 0;
  let shouldDouble = false;
  for (let i = clean.length - 1; i >= 0; i -= 1) {
    let digit = Number(clean[i]);
    if (shouldDouble) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    shouldDouble = !shouldDouble;
  }
  return sum % 10 === 0;
}

export function formatCardExpiryInput(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}/${digits.slice(2)}`;
}

export function validateCardExpiry(value: string): boolean {
  const match = value.trim().match(/^(\d{2})\/(\d{2})$/);
  if (!match) return false;
  const month = Number(match[1]);
  const year2 = Number(match[2]);
  if (month < 1 || month > 12) return false;

  const now = new Date();
  const currentYear2 = now.getFullYear() % 100;
  const currentMonth = now.getMonth() + 1;
  if (year2 < currentYear2) return false;
  if (year2 === currentYear2 && month < currentMonth) return false;
  return true;
}

export function validateCardCvc(value: string, brand?: CardBrand): boolean {
  const clean = value.replace(/\D/g, '');
  if (brand === 'Amex') {
    return clean.length === 4;
  }
  return clean.length === 3 || clean.length === 4;
}

export function generatePaymentReference(prefix = 'GFN'): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const random = Math.random().toString(36).slice(2, 7).toUpperCase();
  return `${prefix}-${y}${m}${d}-${random}`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function downloadPaymentReceipt(params: {
  event: Pick<SportEvent, 'id' | 'title' | 'discipline' | 'location' | 'city' | 'startAt' | 'coachName'>;
  memberName: string;
  memberEmail: string;
  amountCents: number;
  method: 'card' | 'onsite';
  status: 'paid' | 'pending' | 'refunded';
  reference: string;
  cardBrand?: string;
  cardLast4?: string;
}): void {
  const startDate = params.event.startAt.toDate();
  const dateLabel = formatFrenchDateLong(startDate);
  const timeLabel = formatFrenchTime(startDate);
  const amountLabel = formatPriceEuros(params.amountCents);
  const statusLabel =
    params.status === 'paid'
      ? 'Payé'
      : params.status === 'refunded'
        ? 'Remboursé'
        : 'À régler sur place';
  const methodLabel =
    params.method === 'card'
      ? `Carte bancaire${params.cardBrand ? ` ${params.cardBrand}` : ''}${params.cardLast4 ? ` •••• ${params.cardLast4}` : ''}`
      : 'Règlement sur place auprès de l’animateur';

  const html = `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <title>Reçu GetFitNow Event - ${escapeHtml(params.reference)}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f8fafc; color: #0f172a; margin: 0; padding: 32px 16px; }
    .card { max-width: 620px; margin: 0 auto; background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 28px; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 1px solid #e2e8f0; padding-bottom: 16px; margin-bottom: 20px; }
    .brand { font-size: 18px; font-weight: 700; color: #047857; }
    .ref { font-family: ui-monospace, monospace; font-size: 12px; color: #475569; }
    h1 { font-size: 20px; margin: 0 0 6px; }
    .meta { font-size: 13px; color: #475569; margin: 0 0 20px; }
    table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 14px; }
    th, td { text-align: left; padding: 10px 0; border-bottom: 1px solid #f1f5f9; }
    th { color: #64748b; font-weight: 500; width: 42%; }
    td { font-weight: 600; color: #0f172a; }
    .total { font-size: 18px; font-weight: 700; color: #047857; }
    .footer { margin-top: 24px; font-size: 12px; color: #64748b; }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <div>
        <div class="brand">GetFitNow Event</div>
        <div class="meta" style="margin:4px 0 0">Justificatif d’inscription & paiement</div>
      </div>
      <div class="ref">Réf. ${escapeHtml(params.reference)}</div>
    </div>
    <h1>${escapeHtml(params.event.title)}</h1>
    <p class="meta">${escapeHtml(params.event.discipline)} · ${escapeHtml(dateLabel)} à ${escapeHtml(timeLabel)} · ${escapeHtml(params.event.location)}, ${escapeHtml(params.event.city)}</p>
    <table>
      <tr><th>Adhérent</th><td>${escapeHtml(params.memberName)} (${escapeHtml(params.memberEmail)})</td></tr>
      <tr><th>Animateur(s)</th><td>${escapeHtml(params.event.coachName)}</td></tr>
      <tr><th>Mode de règlement</th><td>${escapeHtml(methodLabel)}</td></tr>
      <tr><th>Statut du paiement</th><td>${escapeHtml(statusLabel)}</td></tr>
      <tr><th>Montant</th><td class="total">${escapeHtml(amountLabel)}</td></tr>
    </table>
    <p class="footer">Document généré le ${escapeHtml(new Date().toLocaleDateString('fr-FR'))} · GetFitNow Event</p>
  </div>
</body>
</html>`;

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `recu-${params.reference.toLowerCase()}.html`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
