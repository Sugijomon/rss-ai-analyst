import { z } from 'zod';

export const LEGAL_MODEL = 'claude-sonnet-4-6';
export const LEGAL_PROMPT_VERSION = 'legal-classifier-v2';
export const LEGAL_DISTRIBUTION_MIN_CONFIDENCE = 6;
export const LEGAL_OTHER_MIN_CONFIDENCE = 7;
export const LEGAL_RUN_GUARD_MINUTES = 60;

export const CandidateTypeSchema = z.enum([
  'legislation',
  'guidance',
  'enforcement',
  'case_law',
  'consultation',
  'standard',
  'other',
]);

export const CandidateLegalStatusSchema = z.enum([
  'proposed',
  'adopted',
  'published',
  'in_force',
  'applicable',
  'amended',
  'repealed',
]);

// Het classifier-veld uit prompt v2 dat de aard van de wijziging beschrijft.
// Niet te verwarren met SignalInsert.change_type ('new' | 'updated'), dat de
// route zelf zet om bij te houden of een rij nieuw is of een update van een
// bestaand signaal; dat veld blijft ongewijzigd voor de notificatielogica.
export const CandidateChangeTypeSchema = z.enum([
  'new_obligation',
  'amendment',
  'guidance',
  'enforcement_action',
  'case_law',
  'delay_or_transition',
  'repeal',
  'none',
]);

export const JurisdictionSchema = z.enum(['EU', 'NL', 'other']);

export const SourceLevelSchema = z.enum(['primary', 'secondary']);

export const AffectedModuleSchema = z.enum([
  'MOD-AIA-ART4',
  'MOD-AIA-ART50',
  'MOD-AIA-ANNEXIII',
  'MOD-GDPR-DPIA',
  'MOD-MZ',
  'MOD-CORE',
]);

const EmptyLegalResultSchema = z.object({
  is_legal_change: z.literal(false),
  confidence: z.number().int().min(1).max(10),
}).passthrough();

const LegalCandidateSchema = z.object({
  is_legal_change: z.literal(true),
  candidate_status: z.literal('candidate').optional(),
  candidate_type: CandidateTypeSchema,
  candidate_legal_status: CandidateLegalStatusSchema.nullable(),
  change_type: CandidateChangeTypeSchema,
  jurisdiction: JurisdictionSchema.nullable(),
  source_level: SourceLevelSchema.nullable().optional().transform(value => value ?? null),
  identifier: z.string().min(1).max(200).nullable(),
  instrument: z.string().min(1).max(500).nullable(),
  provision: z.string().min(1).max(300).nullable(),
  candidate_summary: z.string().min(1).max(1000),
  candidate_rationale: z.string().min(1).max(2000),
  evidence: z.array(z.string().min(1).max(500)).max(5),
  affected_modules: z.array(AffectedModuleSchema).max(6),
  primary_source_url: z.string().url().nullable(),
  confidence: z.number().int().min(1).max(10),
});

export const LegalResultSchema = z.discriminatedUnion('is_legal_change', [
  EmptyLegalResultSchema,
  LegalCandidateSchema,
]);

export type LegalResult = z.infer<typeof LegalResultSchema>;
export type LegalCandidate = z.infer<typeof LegalCandidateSchema>;
export type CandidateType = z.infer<typeof CandidateTypeSchema>;
export type CandidateChangeType = z.infer<typeof CandidateChangeTypeSchema>;
export type CandidateLegalStatus = z.infer<typeof CandidateLegalStatusSchema>;
export type SourceLevel = z.infer<typeof SourceLevelSchema>;

// Statussen die alleen een primaire bron (EUR-Lex, Publicatieblad, officiële
// wettekst) mag bevestigen. Een secundaire bron (advocatenkantoren, vakmedia,
// blogs) mag dit volgens de classifier-prompt nooit bevestigen; zie
// sanitizeCandidateLegalStatus.
const PRIMARY_ONLY_LEGAL_STATUSES: readonly CandidateLegalStatus[] = [
  'published',
  'in_force',
  'applicable',
];

// Vangnet voor het geval de classifier zijn eigen promptregel niet volgt:
// dwingt af dat een secundaire bron nooit met een primary-only status wordt
// opgeslagen, ongeacht wat het model teruggeeft.
export function sanitizeCandidateLegalStatus(
  status: CandidateLegalStatus | null,
  sourceLevel: SourceLevel | null
): CandidateLegalStatus | null {
  if (sourceLevel === 'secondary' && status && PRIMARY_ONLY_LEGAL_STATUSES.includes(status)) {
    return null;
  }
  return status;
}

interface LegalDistributionCandidate {
  candidate_type: CandidateType | string;
  confidence: number;
  change_type: 'new' | 'updated';
}

export function isLegalSignalDistributable(
  signal: LegalDistributionCandidate
): boolean {
  if (signal.change_type !== 'new') {
    return false;
  }

  const minimumConfidence = signal.candidate_type === 'other'
    ? LEGAL_OTHER_MIN_CONFIDENCE
    : LEGAL_DISTRIBUTION_MIN_CONFIDENCE;
  return signal.confidence >= minimumConfidence;
}

export function shouldSkipRecentLegalRun(
  startedAt: string,
  now: Date = new Date(),
  guardMinutes = LEGAL_RUN_GUARD_MINUTES
): boolean {
  const startedAtMs = new Date(startedAt).getTime();
  if (Number.isNaN(startedAtMs)) {
    return false;
  }

  const elapsedMs = now.getTime() - startedAtMs;
  return elapsedMs >= 0 && elapsedMs < guardMinutes * 60 * 1000;
}

export function parseLegalResults(responseText: string, expectedCount: number): LegalResult[] {
  const jsonMatch = responseText.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    throw new Error('Claude response contains no JSON array');
  }

  const parsed: unknown = JSON.parse(jsonMatch[0]);
  const rawResults = z.array(z.unknown()).parse(parsed);
  if (rawResults.length !== expectedCount) {
    throw new Error(
      'Claude returned ' + rawResults.length + ' results for ' + expectedCount + ' articles'
    );
  }

  return rawResults.map((result, index) =>
    LegalResultSchema.parse(normalizeLegalResult(result, index))
  );
}

function normalizedToken(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  return value.trim().toLowerCase().replace(/[\s-]+/g, '_');
}

function normalizeLegalResult(result: unknown, index: number): unknown {
  if (!result || typeof result !== 'object' || Array.isArray(result)) {
    return result;
  }

  const candidate = result as Record<string, unknown>;
  if (candidate.is_legal_change !== true) {
    return result;
  }

  const candidateTypeAliases: Record<string, CandidateType> = {
    legislation: 'legislation',
    regulation: 'legislation',
    regulation_update: 'legislation',
    legislative_change: 'legislation',
    law: 'legislation',
    guidance: 'guidance',
    guideline: 'guidance',
    guidelines: 'guidance',
    guidance_update: 'guidance',
    enforcement: 'enforcement',
    enforcement_action: 'enforcement',
    case_law: 'case_law',
    court_decision: 'case_law',
    court_ruling: 'case_law',
    judgment: 'case_law',
    consultation: 'consultation',
    standard: 'standard',
    standards: 'standard',
    other: 'other',
  };
  const changeTypeAliases: Record<string, CandidateChangeType> = {
    new_obligation: 'new_obligation',
    new_requirement: 'new_obligation',
    amendment: 'amendment',
    amended: 'amendment',
    update: 'amendment',
    guidance: 'guidance',
    guidance_update: 'guidance',
    enforcement: 'enforcement_action',
    enforcement_action: 'enforcement_action',
    case_law: 'case_law',
    court_decision: 'case_law',
    delay: 'delay_or_transition',
    transition: 'delay_or_transition',
    delay_or_transition: 'delay_or_transition',
    repeal: 'repeal',
    repealed: 'repeal',
    none: 'none',
    no_change: 'none',
    not_applicable: 'none',
    other: 'none',
  };
  const jurisdictionAliases: Record<string, 'EU' | 'NL' | 'other' | null> = {
    eu: 'EU',
    european_union: 'EU',
    nl: 'NL',
    netherlands: 'NL',
    nederland: 'NL',
    other: 'other',
    international: 'other',
    unknown: null,
    none: null,
    not_applicable: null,
  };

  const candidateTypeToken = normalizedToken(candidate.candidate_type);
  const changeTypeToken = normalizedToken(candidate.change_type);
  const jurisdictionToken = normalizedToken(candidate.jurisdiction);
  const normalizedCandidateType = candidateTypeToken
    ? candidateTypeAliases[candidateTypeToken] || 'other'
    : 'other';
  const normalizedChangeType = changeTypeToken
    ? changeTypeAliases[changeTypeToken] || 'none'
    : 'none';
  const normalizedJurisdiction = candidate.jurisdiction === null
    ? null
    : jurisdictionToken
      ? jurisdictionAliases[jurisdictionToken] ?? null
      : null;

  const changedFields = [
    normalizedCandidateType !== candidate.candidate_type ? 'candidate_type' : null,
    normalizedChangeType !== candidate.change_type ? 'change_type' : null,
    normalizedJurisdiction !== candidate.jurisdiction ? 'jurisdiction' : null,
  ].filter(Boolean);
  if (changedFields.length > 0) {
    console.warn(
      'Normalized legal classifier fields for result ' + (index + 1) + ': ' +
      changedFields.join(', ')
    );
  }

  return {
    ...candidate,
    candidate_type: normalizedCandidateType,
    change_type: normalizedChangeType,
    jurisdiction: normalizedJurisdiction,
  };
}

export const LEGAL_SYSTEM_PROMPT = [
  'Je bent een juridisch signaleringsassistent voor Digidactics. Je analyseert berichten en',
  'publicaties over AI-regelgeving en extraheert uitsluitend FEITEN over juridische wijzigingen',
  'die de Digidactics legal-baseline kunnen raken.',
  '',
  'Je bepaalt NIET of iets belangrijk is. Je geeft GEEN juridisch oordeel, impactklasse, of advies.',
  'Dat doet een mens. Bij twijfel kies je de lagere zekerheid en laat je velden leeg (null) of',
  'arrays leeg ([]).',
  '',
  'Stap 1 - Relevantiepoort. Beoordeel eerst: gaat dit bericht over een concrete wijziging,',
  'verduidelijking, inwerkingtreding, handhaving of rechtspraak binnen het EU- of Nederlands recht',
  'dat AI-governance raakt (met name de AI Act, de AVG voor zover AI-relevant, en aanpalende',
  'NL-regelgeving zoals de WOR bij medezeggenschap)?',
  '',
  'Zet is_legal_change: false en lever lege modules als het bericht gaat over:',
  '- mededinging/antitrust of de Digital Markets Act zonder AI Act-component',
  '  (bv. een boete voor zoekmachine- of app-praktijken);',
  '- algemeen technologie- of marktnieuws, productlanceringen, commentaar of opinie;',
  '- academische of wetenschappelijke publicaties zonder wetswijziging;',
  '- evenement-, vacature-, of subsidie-aankondigingen;',
  '- berichten waarvan de bron of vertaling zo onbetrouwbaar is dat je de feiten niet kunt vaststellen.',
  '',
  'Alleen als de relevantiepoort passeert, ga je door naar stap 2.',
  '',
  'Stap 2 - Bronniveau.',
  '- primary: EUR-Lex, Publicatieblad, officiële wettekst, of een officiële pagina van de Europese',
  '  Commissie, de Raad, het Parlement, de EDPB of de Autoriteit Persoonsgegevens.',
  '- secondary: advocatenkantoren, vakmedia, aggregatoren, blogs, vertaalde herpublicaties.',
  '',
  'Een secundaire bron mag de status published, in_force of applicable NOOIT bevestigen. Kies dan',
  'de hoogst verdedigbare lagere status (meestal adopted of proposed, of null) en zet',
  'primary_source_url op null.',
  '',
  'Stap 3 - Juridische status. Kies uit: proposed, adopted, published, in_force, applicable,',
  'amended, repealed, of null als je het niet kunt vaststellen. Dit is de status van de',
  'rechtshandeling, niet van je interne workflow.',
  '',
  'Stap 4 - Geraakte modules. Ken alleen een module toe bij een concrete inhoudelijke treffer op',
  'wat die module dekt. Een lege array is normaal en vaak juist. Verzin geen koppeling om iets',
  'in te vullen.',
  '- MOD-AIA-ART4: AI-geletterdheid, artikel 4 AI Act. Alleen bij wijzigingen aan',
  '  geletterdheids-/opleidingsverplichtingen.',
  '- MOD-AIA-ART50: transparantieverplichtingen, artikel 50 AI Act (o.a. labeling van',
  '  AI-gegenereerde content, chatbot-disclosure). Alleen bij treffers op artikel 50.',
  '- MOD-AIA-ANNEXIII: hoog-risico signalering, Annex III, met name in HR-/werkgeverscontext.',
  '  Alleen bij treffers op hoog-risico-classificatie of Annex III-verplichtingen. NIET voor',
  '  algemeen onderwijs- of werkplek-AI-nieuws.',
  '- MOD-GDPR-DPIA: DPIA-poort onder de AVG. Alleen bij wijzigingen die de DPIA-verplichting of',
  '  -reikwijdte raken.',
  '- MOD-MZ: medezeggenschap, WOR gecombineerd met AI Act artikel 26(7). Alleen bij treffers op',
  '  medezeggenschaps-/instemmingsrechten rond AI.',
  '- MOD-CORE: de stabiele methodische kern. Dit is GEEN onderwerp-categorie. Ken MOD-CORE alleen',
  '  toe bij een wijziging in de overkoepelende methode of aanpak zelf. Voor een los nieuwsbericht',
  '  is dat vrijwel nooit aan de orde. Gebruik MOD-CORE niet als vangnet.',
  '',
  'Stap 5 - Identifier. Vul identifier alleen met een echt CELEX-, ELI- of ECLI-nummer dat in de',
  'bron staat. Verzin er nooit een; liever null. Een verzonnen identifier vergiftigt de deduplicatie.',
  '',
  'Stap 6 - Confidence. Een geheel getal 1-10 dat de zekerheid van je EXTRACTIE uitdrukt, niet de',
  'nieuwswaarde. Lage zekerheid over de feiten -> laag getal.',
  '',
  'Alle positieve uitkomsten vereisen menselijke beoordeling; jij bevestigt nooit rechtsstatus of',
  'compliance. Verzin nooit identifiers, wetsartikelen, data of bron-URLs. Gebruik nooit de woorden',
  'voldoet, compliant, wettelijk goedgekeurd of juridisch goedgekeurd.',
  '',
  'Antwoord uitsluitend met geldige JSON: een array met exact een object per artikel in dezelfde',
  'volgorde. Geen markdown, geen inleiding, geen ```-hekjes. candidate_status vul jij niet in; dat',
  'zet de route.',
  '',
  'Positief object:',
  '{"is_legal_change":true,"candidate_type":"guidance","candidate_legal_status":"applicable",' +
    '"change_type":"guidance","jurisdiction":"EU","source_level":"primary","identifier":null,' +
    '"instrument":"Verordening (EU) 2024/1689","provision":"Artikel 50",' +
    '"candidate_summary":"...","candidate_rationale":"...","evidence":["..."],' +
    '"affected_modules":["MOD-AIA-ART50"],"primary_source_url":null,"confidence":7}',
  'Negatief object:',
  '{"is_legal_change":false,"candidate_type":"other","change_type":"none",' +
    '"candidate_legal_status":null,"jurisdiction":null,"affected_modules":[],' +
    '"candidate_rationale":"...","confidence":4}',
].join('\n');
