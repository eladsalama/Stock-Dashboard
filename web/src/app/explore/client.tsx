"use client";
import { useState, useEffect } from "react";
import { api } from "@lib/api";
import { useAuth } from "@components/auth-context/AuthContext";
import Link from "next/link";

type MarketItem = {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  marketCap?: number;
  avgVolume?: number;
};

// Section typing + labels so "etfs" shows as "ETFs"
const SECTION_ORDER = ["stocks", "etfs", "crypto"] as const;
type Section = typeof SECTION_ORDER[number];

const SECTION_LABELS: Record<Section, string> = {
  stocks: "Stocks",
  etfs: "ETFs",
  crypto: "Crypto",
};

const STOCK_TABS = [
  { id: "most-active", label: "Most Active" },
  { id: "gainers", label: "Top Gainers" },
  { id: "losers", label: "Top Losers" },
  { id: "trending", label: "Trending Now" },
];

const ETF_TABS = [
  { id: "most-active", label: "Most Active" },
  { id: "gainers", label: "Top Gainers" },
  { id: "losers", label: "Top Losers" },
  { id: "top-performing", label: "Top Performing" },
  { id: "trending", label: "Trending Now" },
];

const CRYPTO_TABS = [
  { id: "most-active", label: "Most Active" },
  { id: "gainers", label: "Top Gainers" },
  { id: "losers", label: "Top Losers" },
  { id: "trending", label: "Trending Now" },
];

export default function ExploreClient() {
  // auth context currently not used here directly; keep hook removable later.
  useAuth();
  const [section, setSection] = useState<Section>("stocks");
  const [activeTab, setActiveTab] = useState("most-active");
  const [data, setData] = useState<MarketItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        let result;
        if (section === "stocks") {
          result = await api.exploreStocks(activeTab);
        } else if (section === "etfs") {
          result = await api.exploreETFs(activeTab);
        } else {
          result = await api.exploreCrypto(activeTab);
        }
        if (!cancelled) setData(result.items);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load data");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [section, activeTab]);

  const tabs =
    section === "stocks" ? STOCK_TABS : section === "etfs" ? ETF_TABS : CRYPTO_TABS;

  function formatNumber(num: number | undefined, decimals = 2): string {
    if (num === undefined) return "—";
    return num.toLocaleString(undefined, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  }

  function formatMarketCap(num: number | undefined): string {
    if (!num) return "—";
    if (num >= 1e12) return `${(num / 1e12).toFixed(2)}T`;
    if (num >= 1e9) return `${(num / 1e9).toFixed(2)}B`;
    if (num >= 1e6) return `${(num / 1e6).toFixed(2)}M`;
    return num.toLocaleString();
  }

  function formatVolume(num: number | undefined): string {
    if (!num) return "—";
    if (num >= 1e9) return `${(num / 1e9).toFixed(2)}B`;
    if (num >= 1e6) return `${(num / 1e6).toFixed(2)}M`;
    if (num >= 1e3) return `${(num / 1e3).toFixed(2)}K`;
    return num.toLocaleString();
  }

  return (
    <div
      style={{
        padding: 0,
        paddingBottom: 40,
        height: "100%",
        overflow: "auto",
        scrollbarWidth: "none", // Firefox
        msOverflowStyle: "none", // IE and Edge
      }}
      className="explore-container"
    >
      <h1
        style={{
          fontSize: 28,
          fontWeight: 700,
          marginBottom: 24,
          color: "var(--color-fg)",
        }}
      >
        Explore Markets
      </h1>

      {/* Section Tabs */}
      <div
        style={{
          display: "flex",
          gap: 8,
          marginBottom: 24,
          borderBottom: `1px solid var(--color-border)`,
        }}
      >
        {SECTION_ORDER.map((s) => (
          <button
            key={s}
            onClick={() => {
              setSection(s);
              setActiveTab("most-active");
            }}
            style={{
              padding: "12px 20px",
              background: "none",
              border: "none",
              borderBottom:
                section === s
                  ? `2px solid var(--color-accent)`
                  : "2px solid transparent",
              color:
                section === s
                  ? "var(--color-accent)"
                  : "var(--color-fg-muted)",
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
              textTransform: "none", // don't auto-capitalize; we provide exact labels
            }}
          >
            {SECTION_LABELS[s]}
          </button>
        ))}
      </div>

      {/* Category Tabs */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className="mini-btn"
            style={{
              padding: "6px 12px",
              background:
                activeTab === tab.id
                  ? "var(--color-accent)"
                  : "var(--color-bg-elevated)",
              color: activeTab === tab.id ? "#ffffff" : "var(--color-fg)",
              border: `1px solid ${
                activeTab === tab.id ? "transparent" : "var(--color-border)"
              }`,
              borderRadius: 6,
              fontSize: 13,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Data Table */}
      {loading && (
        <div
          style={{ padding: 40, textAlign: "center", color: "var(--color-fg-muted)" }}
        >
          Loading...
        </div>
      )}

      {error && (
        <div style={{ padding: 20, color: "var(--color-danger)", fontSize: 14 }}>
          Error: {error}
        </div>
      )}

      {!loading && !error && data.length === 0 && (
        <div
          style={{ padding: 40, textAlign: "center", color: "var(--color-fg-muted)" }}
        >
          No data available
        </div>
      )}

      {!loading && !error && data.length > 0 && (
        <div
          style={{
            background: "var(--color-bg-elevated)",
            border: `1px solid var(--color-border)`,
            borderRadius: 6,
            overflow: "hidden",
          }}
        >
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr
                style={{
                  background: "var(--color-bg-elevated)",
                  borderBottom: `1px solid var(--color-border)`,
                }}
              >
                <th
                  style={{
                    textAlign: "left",
                    padding: "12px 16px",
                    fontSize: 12,
                    fontWeight: 600,
                    color: "var(--color-fg-muted)",
                  }}
                >
                  Symbol
                </th>
                <th
                  style={{
                    textAlign: "left",
                    padding: "12px 8px 12px 16px",
                    fontSize: 12,
                    fontWeight: 600,
                    color: "var(--color-fg-muted)",
                  }}
                >
                  Name
                </th>
                <th
                  style={{
                    textAlign: "right",
                    padding: "12px 16px 12px 8px",
                    fontSize: 12,
                    fontWeight: 600,
                    color: "var(--color-fg-muted)",
                  }}
                >
                  Price
                </th>
                <th
                  style={{
                    textAlign: "right",
                    padding: "12px 16px",
                    fontSize: 12,
                    fontWeight: 600,
                    color: "var(--color-fg-muted)",
                  }}
                >
                  Change
                </th>
                <th
                  style={{
                    textAlign: "right",
                    padding: "12px 16px",
                    fontSize: 12,
                    fontWeight: 600,
                    color: "var(--color-fg-muted)",
                  }}
                >
                  % Change
                </th>
                <th
                  style={{
                    textAlign: "right",
                    padding: "12px 16px",
                    fontSize: 12,
                    fontWeight: 600,
                    color: "var(--color-fg-muted)",
                  }}
                >
                  Volume
                </th>
                {section !== "crypto" && (
                  <th
                    style={{
                      textAlign: "right",
                      padding: "12px 16px",
                      fontSize: 12,
                      fontWeight: 600,
                      color: "var(--color-fg-muted)",
                    }}
                  >
                    Market Cap
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {data.map((item, idx) => (
                <tr
                  key={item.symbol}
                  style={{
                    borderBottom:
                      idx < data.length - 1
                        ? `1px solid var(--color-border)`
                        : "none",
                  }}
                >
                  <td style={{ padding: "12px 16px" }}>
                    <Link
                      href={`/symbol/${item.symbol}`}
                      style={{
                        color: "var(--color-accent)",
                        textDecoration: "none",
                        fontWeight: 600,
                        fontSize: 13,
                      }}
                    >
                      {item.symbol}
                    </Link>
                  </td>
                  <td
                    style={{
                      padding: "12px 8px 12px 16px",
                      fontSize: 13,
                      color: "var(--color-fg)",
                      maxWidth: 250,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {item.name}
                  </td>
                  <td
                    style={{
                      padding: "12px 16px 12px 8px",
                      textAlign: "right",
                      fontSize: 13,
                      fontWeight: 600,
                      color: "var(--color-fg)",
                    }}
                  >
                    ${formatNumber(item.price)}
                  </td>
                  <td
                    style={{
                      padding: "12px 16px",
                      textAlign: "right",
                      fontSize: 13,
                      fontWeight: 600,
                      color:
                        item.change >= 0
                          ? "var(--color-success)"
                          : "var(--color-danger)",
                    }}
                  >
                    {item.change >= 0 ? "+" : ""}
                    {formatNumber(item.change)}
                  </td>
                  <td
                    style={{
                      padding: "12px 16px",
                      textAlign: "right",
                      fontSize: 13,
                      fontWeight: 600,
                      color:
                        item.changePercent >= 0
                          ? "var(--color-success)"
                          : "var(--color-danger)",
                    }}
                  >
                    {item.changePercent >= 0 ? "+" : ""}
                    {formatNumber(item.changePercent)}%
                  </td>
                  <td
                    style={{
                      padding: "12px 16px",
                      textAlign: "right",
                      fontSize: 13,
                      color: "var(--color-fg-muted)",
                    }}
                  >
                    {formatVolume(item.volume)}
                  </td>
                  {section !== "crypto" && (
                    <td
                      style={{
                        padding: "12px 16px",
                        textAlign: "right",
                        fontSize: 13,
                        color: "var(--color-fg-muted)",
                      }}
                    >
                      {formatMarketCap(item.marketCap)}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
