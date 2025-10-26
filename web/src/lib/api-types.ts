// Shared API types (duplicated from backend for frontend independence)

export interface SymbolStats {
  regularMarketPrice?: number;
  regularMarketChange?: number;
  regularMarketChangePercent?: number;
  regularMarketDayHigh?: number;
  regularMarketDayLow?: number;
  regularMarketVolume?: number;
  regularMarketPreviousClose?: number;
  fiftyTwoWeekHigh?: number;
  fiftyTwoWeekLow?: number;
  fiftyDayAverage?: number;
  twoHundredDayAverage?: number;
  marketCap?: number;
  trailingPE?: number;
  forwardPE?: number;
  dividendYield?: number;
  beta?: number;
  averageVolume?: number;
}

export interface NewsItem {
  title: string;
  publisher?: string;
  link?: string;
  providerPublishTime?: number;
  type?: string;
  thumbnail?: {
    resolutions?: Array<{
      url: string;
      width?: number;
      height?: number;
    }>;
  };
  relatedTickers?: string[];
}
