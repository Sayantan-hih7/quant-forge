import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { invariant } from '../../../shared/errors.js';
import { numberOrNull, object } from '../../../shared/http-client.js';
import { exchangeDate } from './nse-reports.js';

export interface OwnershipReport {
  period: string; value: number | 'not-applicable'; promoterShares?: number; encumberedShares?: number;
  evidence: 'reported-total' | 'explicit-no-encumbrance' | 'no-promoters';
}
const array = (value: unknown): Record<string, unknown>[] => (Array.isArray(value) ? value : value == null ? [] : [value]).map(object);
function validPeriod(period: string, observedAt: string) {
  invariant(/^\d{4}-\d{2}-\d{2}$/.test(period) && Number.isFinite(Date.parse(period)) && new Date(period).toISOString().slice(0, 10) === period
    && period <= observedAt.slice(0, 10) && Date.parse(period) + 150 * 86400000 >= Date.parse(observedAt), 'Shareholding report is stale or has an invalid date');
}
export function selectNseFiling(payload: unknown, symbol: string, observedAt: string) {
  invariant(Array.isArray(payload), 'NSE shareholding response format changed');
  return payload.map(object).filter(row => row.symbol === symbol).flatMap(row => {
    try {
      const period = exchangeDate(String(row.date)); validPeriod(period, observedAt);
      const published = exchangeDate(String(row.broadcastDate).split(' ')[0]);
      if (published > observedAt.slice(0, 10)) return [];
      return [{ url: String(row.xbrl), period, published, noPromoters: numberOrNull(row.pr_and_prgrp) === 0 }];
    } catch { return []; }
  }).sort((a, b) => b.period.localeCompare(a.period) || b.published.localeCompare(a.published))[0];
}
export function parseNseShareholding(xml: string, isin: string, expectedPeriod: string, observedAt: string, noPromoters = false): OwnershipReport {
  invariant(Buffer.byteLength(xml) <= 5_000_000 && !/<!DOCTYPE|<!ENTITY/i.test(xml), 'Unsupported shareholding XML');
  invariant(XMLValidator.validate(xml) === true, 'Invalid shareholding XML');
  const root = object(new XMLParser({ ignoreAttributes: false, removeNSPrefix: true, parseTagValue: false, processEntities: false }).parse(xml).xbrl);
  const contexts = array(root.context);
  const mains = new Set(contexts.filter(c => !c.scenario && !object(c.entity).segment).map(c => c['@_id']));
  const scalar = (key: string) => {
    const values = array(root[key]).filter(v => mains.has(v['@_contextRef']) && v['@_nil'] !== 'true').map(v => String(v['#text'] ?? ''));
    invariant(new Set(values).size <= 1, 'Conflicting shareholding facts'); return values[0];
  };
  invariant(scalar('ISIN') === isin, 'Shareholding filing ISIN does not match the stock');
  const reportDate = scalar('DateOfReport');
  const reportFact = array(root.DateOfReport).find(v => mains.has(v['@_contextRef']));
  const reportContext = contexts.find(c => c['@_id'] === reportFact?.['@_contextRef']);
  // In capital-allotment filings, DateOfReport is the preparation date. The
  // XBRL instant is the actual ownership observation (also used by the index).
  const period = String(object(reportContext?.period).instant ?? '');
  invariant(period === expectedPeriod && reportDate >= period && reportDate <= observedAt.slice(0, 10), 'Shareholding filing date does not match its index');
  validPeriod(period, observedAt); validPeriod(reportDate, observedAt);
  const promoterContexts = new Set(contexts.filter(c => {
    const members = array(object(c.scenario).explicitMember);
    return object(c.period).instant === period && members.length === 1
      && String(members[0]['@_dimension']).split(':').pop() === 'CategoryOfShareholdersAxis'
      && String(members[0]['#text']).split(':').pop() === 'ShareholdingOfPromoterAndPromoterGroupMember';
  }).map(c => c['@_id']));
  const numeric = (key: string) => {
    const values = array(root[key]).filter(v => promoterContexts.has(v['@_contextRef']) && v['@_nil'] !== 'true').map(v => numberOrNull(v['#text'])).filter(v => v !== null);
    invariant(new Set(values).size <= 1, 'Conflicting promoter totals'); return values[0];
  };
  const noEncumbrance = ['Pledged', 'NonDisposalUndertaking', 'OtherThanByWayOfPledgeOrNDU'].every(kind => {
    const key = `WhetherAnySharesHeldByPromotersAreEncumberedUnder${kind}`;
    // Other encumbrances use a different taxonomy prefix.
    const actual = kind === 'OtherThanByWayOfPledgeOrNDU' ? 'WhetherAnySharesHeldByPromotersAreEncumberedOtherThanByWayOfPledgeOrNDU' : key;
    return ['false', '0'].includes(scalar(`${actual}ForPromoterAndPromoterGroup`) ?? scalar(actual) ?? '');
  });
  const shares = numeric('NumberOfShares'), encumbered = numeric('NumberOfSharesEncumbered');
  if (noPromoters && (shares === undefined || shares === 0) && noEncumbrance) return { period, value: 'not-applicable', promoterShares: 0, encumberedShares: 0, evidence: 'no-promoters' };
  invariant(shares !== undefined && shares > 0, 'Promoter share total is unavailable');
  if (encumbered !== undefined) {
    invariant(encumbered >= 0 && encumbered <= shares && !(noEncumbrance && encumbered > 0), 'Invalid encumbered share total');
    return { period, value: 100 * encumbered / shares, promoterShares: shares, encumberedShares: encumbered, evidence: 'reported-total' };
  }
  invariant(noEncumbrance, 'Encumbered share total is unavailable');
  return { period, value: 0, promoterShares: shares, encumberedShares: 0, evidence: 'explicit-no-encumbrance' };
}
export function selectBsePledge(payload: unknown, securityId: string, observedAt: string) {
  return array(object(payload).Table).filter(r => String(r.Fld_ScripCode) === securityId).flatMap(row => {
    try {
      const raw = String(row.Fld_EndDate), period = `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6)}`;
      validPeriod(period, observedAt);
      const published = String(row.SHP_PulishedTime ?? '').slice(0, 10);
      if (!published || published > observedAt.slice(0, 10)) return [];
      return [{ row, period }];
    } catch { return []; }
  }).sort((a, b) => b.period.localeCompare(a.period))[0];
}
export function parseBseShareholding(payload: unknown, period: string, observedAt: string, allSharesPublic = false): OwnershipReport {
  validPeriod(period, observedAt);
  const header = array(object(payload).Table)[0] ?? {};
  const declaredNone = header.Fld_IsPledge === false && (header.Fld_IsNDU ?? header.Fld_PromoterSharesNdu) === false
    && (header.Fld_IsOtherEncumbrances ?? header.Fld_PromoterSharesOtherEncumbrance) === false;
  const totals = array(object(payload).Table1).filter(r => r.Fld_Code === 'STA1A2' && (r.Fld_Level ?? r.FLD_LEVEL) === 'A=A1+A2');
  if (!totals.length && allSharesPublic && declaredNone && array(object(payload).Table1).every(r => (numberOrNull(r.Fld_TotalNoOfShares) ?? 0) === 0)) {
    return { period, value: 'not-applicable', promoterShares: 0, encumberedShares: 0, evidence: 'no-promoters' };
  }
  invariant(totals.length === 1, 'BSE promoter-group total is unavailable');
  const total = totals[0], shares = numberOrNull(total.Fld_TotalNoOfShares);
  const encumbered = numberOrNull(total.Fld_TotalencumberedNoOfShares);
  if (shares === 0 && declaredNone) return { period, value: 'not-applicable', promoterShares: 0, encumberedShares: 0, evidence: 'no-promoters' };
  invariant(shares !== null && shares > 0, 'BSE promoter share total is unavailable');
  if (encumbered !== null) {
    invariant(encumbered >= 0 && encumbered <= shares && !(declaredNone && encumbered > 0), 'Invalid BSE encumbered total');
    return { period, value: 100 * encumbered / shares, promoterShares: shares, encumberedShares: encumbered, evidence: 'reported-total' };
  }
  invariant(declaredNone, 'BSE encumbered share total is unavailable');
  return { period, value: 0, promoterShares: shares, encumberedShares: 0, evidence: 'explicit-no-encumbrance' };
}
