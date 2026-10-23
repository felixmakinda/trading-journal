/**
 * Turns a TradingView snapshot link (https://www.tradingview.com/x/AbC123/)
 * into its image URL, so the chart can be shown inline. Other links return null.
 */
export function snapshotImage(url: string | null): string | null {
  if (!url) return null;
  const m = url.match(/^https:\/\/(?:www\.)?tradingview\.com\/x\/([A-Za-z0-9]+)\/?$/);
  if (!m) return null;
  const id = m[1]!;
  return `https://s3.tradingview.com/snapshots/${id[0]!.toLowerCase()}/${id}.png`;
}
