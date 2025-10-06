import yahooFinance from 'yahoo-finance2';

export interface SymbolStats {
  symbol: string;
  previousClose?: number;
  open?: number;
  bid?: number; bidSize?: number;
  ask?: number; askSize?: number;
  dayLow?: number; dayHigh?: number;
  fiftyTwoWeekLow?: number; fiftyTwoWeekHigh?: number;
  volume?: number; avgVolume?: number;
  marketCap?: number;
  beta?: number;
  peRatioTTM?: number;
  epsTTM?: number;
  earningsDate?: string; // ISO (first upcoming)
  forwardDividendRate?: number; forwardDividendYield?: number; // yield fraction (0.023)
  exDividendDate?: string; // ISO
  oneYearTargetEst?: number;
  fiscalYearEnd?: string; // ISO date for last fiscal year end
  longBusinessSummary?: string;
  website?: string;
  fullTimeEmployees?: number;
  sector?: string; industry?: string;
  longName?: string;
  source: 'yahoo';
  asOf: string; // fetch timestamp
}

// Fetch a collection of summary modules in one call and normalize the subset we need for the UI.
export async function fetchYahooStats(symbol: string): Promise<SymbolStats> {
  const s = symbol.trim().toUpperCase();
  if(!s) throw new Error('Empty symbol');
  const modules: ("summaryProfile" | "price" | "summaryDetail" | "financialData" | "calendarEvents" | "defaultKeyStatistics")[] = [
    'summaryProfile',
    'price',
    'summaryDetail',
    'financialData',
    'calendarEvents',
    'defaultKeyStatistics'
  ];
  // quoteSummary can throw for invalid symbols; allow it to bubble.
  const qs = await yahooFinance.quoteSummary(s, { modules });

  // Using 'any' for loose yahoo-finance2 module objects (shape varies by symbol); narrow fields extracted below.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const price: any = qs.price || {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const summaryDetail: any = qs.summaryDetail || {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const financialData: any = qs.financialData || {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cal: any = qs.calendarEvents || {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const keyStats: any = qs.defaultKeyStatistics || {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const profile: any = qs.summaryProfile || {};

  // Earnings date can be array (earningsDate) inside calendarEvents. Grab the first upcoming.
  let earningsDate: string | undefined;
  const earnings = cal.earnings || cal.earningsDate || cal.earnings ? (cal.earningsDate || cal.earnings) : undefined;
  const poss = (earnings && Array.isArray(earnings) ? earnings : Array.isArray(cal.earningsDate?.raw) ? cal.earningsDate.raw : undefined);
  if(Array.isArray(poss) && poss.length) {
    const first = poss[0];
    if(typeof first === 'number') {
      earningsDate = new Date(first * (first < 1e12 ? 1000 : 1)).toISOString();
    } else if(first && typeof first === 'object' && 'raw' in first) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const raw = (first as any).raw;
      if(typeof raw === 'number') earningsDate = new Date(raw * (raw < 1e12 ? 1000 : 1)).toISOString();
    }
  } else if(cal?.earningsDate && Array.isArray(cal.earningsDate) && cal.earningsDate.length) {
    const raw = cal.earningsDate[0]?.raw;
    if(typeof raw === 'number') earningsDate = new Date(raw * (raw < 1e12 ? 1000 : 1)).toISOString();
  }

  let exDividendDate: string | undefined;
  if(summaryDetail?.exDividendDate?.raw) {
    const raw = summaryDetail.exDividendDate.raw;
    if(typeof raw === 'number') exDividendDate = new Date(raw * (raw < 1e12 ? 1000 : 1)).toISOString();
  }
  let fiscalYearEnd: string | undefined;
  if(keyStats?.lastFiscalYearEnd?.raw) {
    const raw = keyStats.lastFiscalYearEnd.raw;
    if(typeof raw === 'number') fiscalYearEnd = new Date(raw * (raw < 1e12 ? 1000 : 1)).toISOString();
  }

  return {
    symbol: s,
    previousClose: numberOrU(summaryDetail.previousClose ?? price.regularMarketPreviousClose),
    open: numberOrU(price.regularMarketOpen ?? summaryDetail.open),
    bid: numberOrU(price.bid), bidSize: numberOrU(price.bidSize),
    ask: numberOrU(price.ask), askSize: numberOrU(price.askSize),
    dayLow: numberOrU(price.regularMarketDayLow), dayHigh: numberOrU(price.regularMarketDayHigh),
    fiftyTwoWeekLow: numberOrU(summaryDetail.fiftyTwoWeekLow), fiftyTwoWeekHigh: numberOrU(summaryDetail.fiftyTwoWeekHigh),
    volume: numberOrU(price.regularMarketVolume ?? summaryDetail.volume),
    avgVolume: numberOrU(summaryDetail.averageDailyVolume3Month ?? summaryDetail.averageDailyVolume10Day),
    marketCap: numberOrU(price.marketCap ?? summaryDetail.marketCap),
    beta: numberOrU(summaryDetail.beta ?? keyStats.beta ?? keyStats.beta3Year),
    peRatioTTM: numberOrU(summaryDetail.trailingPE ?? price.trailingPE),
    epsTTM: numberOrU(price.epsTrailingTwelveMonths ?? keyStats.trailingEps),
    earningsDate,
    forwardDividendRate: numberOrU(summaryDetail.dividendRate),
    forwardDividendYield: numberOrU(summaryDetail.dividendYield),
    exDividendDate,
    oneYearTargetEst: numberOrU(financialData.targetMeanPrice ?? price.targetMeanPrice),
  fiscalYearEnd,
    longBusinessSummary: profile.longBusinessSummary,
    website: profile.website,
    fullTimeEmployees: numberOrU(profile.fullTimeEmployees),
    sector: profile.sector,
    industry: profile.industry,
    longName: price.longName || price.shortName || profile.longName,
    source: 'yahoo',
    asOf: new Date().toISOString()
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function numberOrU(v: any): number | undefined { const n = Number(v); return isFinite(n) ? n : undefined; }
