import { z } from 'zod';

export const LEGAL_MODEL = 'claude-sonnet-4-6';
export const LEGAL_PROMPT_VERSION = 'legal-classifier-v1.1';

export const CandidateTypeSchema = z.enum([
  'regulation_update',
  'guidance',
  'enforcement',
  'court_decision',
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

export const JurisdictionSchema = z.enum(['EU', 'NL', 'other', 'unknown']);

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
  candidate_status: z.literal('candidate'),
  candidate_type: CandidateTypeSchema,
  candidate_legal_status: CandidateLegalStatusSchema.nullable(),
  jurisdiction: JurisdictionSchema,
  identifier: z.string().min(1).max(200).nullable(),
  instrument: z.string().min(1).max(500).nullable(),
  provision: z.string().min(1).max(300).nullable(),
  candidate_summary: z.string().min(1).max(1000),
  candidate_rationale: z.string().min(1).max(2000),
  evidence: z.array(z.string().min(1).max(500)).max(5),
  affected_modules: z.array(AffectedModuleSchema).max(6),
  primary_source_url: z.string().url().nullable(),
  confidence: z.number().int().min(1).max(10),
}).strict();

export const LegalResultSchema = z.discriminatedUnion('is_legal_change', [
  EmptyLegalResultSchema,
  LegalCandidateSchema,
]);

export type LegalResult = z.infer<typeof LegalResultSchema>;
export type LegalCandidate = z.infer<typeof LegalCandidateSchema>;

export function parseLegalResults(responseText: string, expectedCount: number): LegalResult[] {
  const jsonMatch = responseText.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    throw new Error('Claude response contains no JSON array');
  }

  const parsed: unknown = JSON.parse(jsonMatch[0]);
  const results = z.array(LegalResultSchema).parse(parsed);
  if (results.length !== expectedCount) {
    throw new Error(
      'Claude returned ' + results.length + ' results for ' + expectedCount + ' articles'
    );
  }
  return results;
}

export const LEGAL_SYSTEM_PROMPT = [
  'Je bent een juridisch signaleringsassistent voor Digidactics.',
  'Je extraheert uitsluitend kandidaat-feiten over mogelijke juridische wijzigingen.',
  'Je bevestigt nooit rechtsstatus, compliance, juridische classificatie of juridisch advies.',
  'Alle positieve uitkomsten hebben candidate_status: "candidate" en vereisen menselijke beoordeling.',
  'Bij twijfel geef je is_legal_change: false of gebruik je null voor het onzekere veld.',
  '',
  'Kies candidate_type exact uit:',
  'regulation_update, guidance, enforcement, court_decision, consultation, standard, other.',
  '',
  'Kies candidate_legal_status uit:',
  'proposed, adopted, published, in_force, applicable, amended, repealed, of null.',
  'Dit veld is altijd een kandidaat-extractie en nooit een bevestiging.',
  '',
  'Kies jurisdiction exact uit: EU, NL, other, unknown.',
  '',
  'Baseline-modules:',
  'MOD-AIA-ART4, MOD-AIA-ART50, MOD-AIA-ANNEXIII, MOD-GDPR-DPIA, MOD-MZ, MOD-CORE.',
  '',
  'Een secundaire bron signaleert alleen. Zet primary_source_url dan op null.',
  'Verzin nooit identifiers, wetsartikelen, data of bron-URLs.',
  'Gebruik nooit de woorden voldoet, compliant, wettelijk goedgekeurd of juridisch goedgekeurd.',
  '',
  'Geef uitsluitend een JSON-array terug, met exact een object per artikel in dezelfde volgorde.',
  'Positief object:',
  '{"is_legal_change":true,"candidate_status":"candidate","candidate_type":"guidance",' +
    '"candidate_legal_status":null,"jurisdiction":"EU","identifier":null,"instrument":null,' +
    '"provision":null,"candidate_summary":"...","candidate_rationale":"...","evidence":["..."],' +
    '"affected_modules":[],"primary_source_url":null,"confidence":7}',
  'Negatief object:',
  '{"is_legal_change":false,"confidence":4}',
].join('\n');
