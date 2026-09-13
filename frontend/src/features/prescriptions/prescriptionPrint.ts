import type { Prescription, PrescriptionItem } from './types';
const escape = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

// Presentation only: never rewrite the issued snapshot or free-text instructions.
const specialties: Record<string, string> = {
  PEDIATRICS: 'Pediatría', DENTISTRY: 'Odontología', DENTAL: 'Odontología', ODONT: 'Odontología',
  ORTHODONTICS: 'Ortodoncia', ENDODONTICS: 'Endodoncia', PERIODONTICS: 'Periodoncia',
  PEDIATRIC_DENTISTRY: 'Odontopediatría', ORAL_SURGERY: 'Cirugía oral',
  PROSTHODONTICS: 'Prostodoncia',
};
const specialtyLabel = (value?: string | null) => specialties[value?.trim().toUpperCase() ?? ''] ?? value?.trim() ?? '';
const sentencePart = (value: string) => value.trim().replace(/[.,;]+$/, '').replace(/^(\p{Lu})(?=\p{Ll})/u, c => c.toLocaleLowerCase('es-MX'));
const printDirections = (i: PrescriptionItem) => {
  const route = sentencePart(i.route).replace(/^oral$/i, 'oral');
  const verb = route === 'oral' ? 'Tomar' : 'Administrar';
  return `${verb} ${i.dose.trim()} por vía ${route} ${sentencePart(i.frequency)} durante ${sentencePart(i.duration)}.`;
};

export function prescriptionPrintHtml(r: Prescription) {
  const s = r.snapshot;
  if (!s || r.status === 'DRAFT') throw new Error('Solo las recetas emitidas tienen un documento imprimible.');
  const p = s.professional;
  // Only show compatible professional credentials; snapshots without context keep legacy behavior.
  const showProfessionalSpecialty = s.clinic.clinicalSpecialty == null
    || p.specialty === s.clinic.clinicalSpecialty;
  const specialty = showProfessionalSpecialty ? specialtyLabel(p.specialty) : '';
  const specialtyLicense = showProfessionalSpecialty ? p.specialtyLicense : null;
  // Legacy snapshots used the dental title. Never infer their context from today's clinic or professional.
  const documentSpecialty = s.clinic.clinicalSpecialty ?? 'DENTISTRY';
  const title = documentSpecialty === 'PEDIATRICS' ? 'RECETA PEDIÁTRICA' : 'RECETA ODONTOLÓGICA';
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Receta ${escape(s.folio)}</title><style>
  *{box-sizing:border-box}body{font:10.5pt Arial,sans-serif;line-height:1.4;color:#222;margin:0;padding:24px;overflow-wrap:anywhere}main{max-width:186mm;margin:auto}
  header{display:flex;justify-content:space-between;gap:8mm;border-bottom:2px solid #333;padding-bottom:4mm;break-inside:avoid}.clinic{flex:1;min-width:0}.document{flex:0 0 76mm;text-align:right}
  h1{font-size:19pt;line-height:1.15;margin:0 0 2mm;font-weight:600}h2{font-size:12pt;letter-spacing:.06em;margin:0 0 2mm}h3{font-size:9pt;letter-spacing:.08em;margin:0 0 2mm}p{margin:1mm 0;white-space:pre-wrap}.contact{font-size:9pt;color:#444}.date{font-size:10pt;margin:2mm 0}.folio{font-size:8pt;line-height:1.4;color:#444}.label{font-size:8pt;letter-spacing:.05em;color:#555}.folio-value{font-family:Arial,sans-serif}
  .details{padding:3mm 0;border-bottom:1px solid #999;break-inside:avoid}.patient{display:flex;justify-content:space-between;gap:6mm}.patient-name{font-size:12pt;font-weight:600}.birth{flex-shrink:0;text-align:right}.professional{margin-top:2mm;padding-top:2mm;border-top:1px solid #ddd;font-size:9pt}.professional-name{font-weight:600;font-size:10pt}.credentials{font-size:8.5pt;color:#444}
  .medications{margin-top:2mm}.medication{display:flex;gap:3mm;padding:2mm 0;border-bottom:1px solid #ccc;break-inside:avoid;page-break-inside:avoid}.rp{flex:0 0 11mm;white-space:nowrap;font:italic 20pt Georgia,serif;line-height:1.2}.medication-body{flex:1;min-width:0}.medication h3{font-size:11pt;letter-spacing:0;margin:0;line-height:1.35}.form{font-size:9pt;color:#444;margin-bottom:2mm}.directions{font-size:10.5pt;line-height:1.5}.quantity,.additional{font-size:9pt}.quantity{margin-top:1.5mm}.additional{color:#333}
  .general{padding:3mm 0;margin-top:2mm;border-bottom:1px solid #aaa}.general h3{break-after:avoid}.general p{font-size:10pt;line-height:1.5;orphans:3;widows:3}
  .closing{break-inside:avoid;page-break-inside:avoid}.signature{padding-top:10mm;margin:0 auto;text-align:center;max-width:100mm;font-size:9pt}.signature hr{border:0;border-top:1px solid #333;margin:0 0 1.5mm}.signature-label{font-size:8pt;color:#555}.signature-name{font-weight:600;font-size:10pt}footer{border-top:1px solid #bbb;padding-top:2mm;margin-top:5mm;font-size:7.5pt;color:#555;text-align:center}
  .void-watermark{display:none}.cancellation{break-inside:avoid;margin-top:3mm}.cancelled{border:2px solid #333;padding:2mm;font-weight:bold;font-size:16pt;letter-spacing:.06em}.cancellation p{font-size:9pt}
  button{padding:12px;cursor:pointer}.controls{margin-bottom:24px}.controls p{font-size:10pt}
  @page{size:letter;margin:15mm 15mm 20mm}
  @media print{body{padding:0}.controls{display:none}main{max-width:none}.void-watermark{display:block;position:fixed;top:45%;left:0;width:100%;text-align:center;transform:rotate(-28deg);font-size:42pt;font-weight:bold;opacity:.16;z-index:10;pointer-events:none}}
  </style></head><body><main>
  <div class="controls"><button onclick="window.print()">Imprimir / guardar como PDF</button><p>Selecciona papel Carta y escala 100 %. Para descargar, elige «Guardar como PDF». Desactiva «Encabezados y pies de página» del navegador para omitir fecha/hora, URL y número de página.</p></div>
  <header><div class="clinic"><h1>${escape(s.clinic.name)}</h1><p class="contact">${escape(p.address)}</p>${p.phone ? `<p class="contact">Tel. ${escape(p.phone)}</p>` : ''}</div><div class="document"><h2>${escape(title)}</h2><p class="date">Fecha: ${escape(new Date(s.issuedAt).toLocaleDateString('es-MX', { timeZone: s.clinic.timeZone }))}</p><div class="folio"><span class="label">FOLIO</span><br><span class="folio-value">${escape(s.folio)}</span></div></div></header>
  ${r.status === 'CANCELLED' ? `<div class="void-watermark">RECETA ANULADA</div><div class="cancellation"><div class="cancelled">RECETA ANULADA</div><p>Motivo: ${escape(r.cancellationReason)}</p><p>Anulada: ${escape(new Date(r.cancelledAt!).toLocaleDateString('es-MX', { timeZone: s.clinic.timeZone }))}</p></div>` : ''}
  <section class="details"><div class="patient"><div><span class="label">PACIENTE</span><p class="patient-name">${escape(s.patient.name)}</p></div><div class="birth"><span class="label">FECHA DE NACIMIENTO</span><p>${escape(s.patient.birthDate.split('-').reverse().join('/'))}</p></div></div>
  <div class="professional"><p><span class="professional-name">${escape(p.name)}</span>${specialty ? ` · ${escape(specialty)}` : ''}</p><p class="credentials">Cédula profesional: ${escape(p.license)}${specialtyLicense ? ` · Cédula de especialidad: ${escape(specialtyLicense)}` : ''}</p></div></section>
  <div class="medications">${s.items.map(i => `<section class="medication"><div class="rp">Rp.</div><div class="medication-body"><h3>${escape(i.medication.toUpperCase())} ${escape(i.concentration)}${i.brand ? ` (${escape(i.brand)})` : ''}</h3><p class="form">${escape(i.form)}</p><p class="directions"><strong>Modo de uso:</strong> ${escape(printDirections(i))}</p><p class="quantity"><strong>Cantidad:</strong> ${escape(i.quantity)}</p>${i.instructions ? `<p class="additional"><strong>Instrucciones adicionales:</strong> ${escape(i.instructions)}</p>` : ''}</div></section>`).join('')}</div>
  ${s.generalInstructions ? `<section class="general"><h3>INDICACIONES GENERALES</h3><p>${escape(s.generalInstructions)}</p></section>` : ''}
  <div class="closing"><div class="signature"><hr><p class="signature-label">Firma del profesional</p><p class="signature-name">${escape(p.name)}</p>${specialty ? `<p>${escape(specialty)}</p>` : ''}<p class="credentials">Cédula profesional: ${escape(p.license)}</p>${specialtyLicense ? `<p class="credentials">Cédula de especialidad: ${escape(specialtyLicense)}</p>` : ''}</div><footer>Folio ${escape(s.folio)} · YESKIRA${r.status === 'CANCELLED' ? ' · RECETA ANULADA' : ''}</footer></div></main></body></html>`;
}
