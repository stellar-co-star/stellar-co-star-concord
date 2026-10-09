import { useState } from "react";
import { api, type AssetSummary, type Holdings as HoldingsData } from "../api";
import {
  Addr,
  Badge,
  Empty,
  ErrorNote,
  Field,
  Figures,
  LOCAL_TIME_HINT,
  Notice,
  Skeleton,
  StatusBadge,
  TableWrap,
  Units,
  inputClass,
  localToIso,
  useLoad,
  when,
} from "../ui";

export function Holdings({ asset }: { asset: AssetSummary }) {
  const [asOf, setAsOf] = useState("");
  const query = asOf ? `?asOf=${encodeURIComponent(localToIso(asOf))}` : "";
  const { data, error, loading } = useLoad(
    () => api<HoldingsData>(`/assets/${asset.id}/holdings${query}`),
    [asset.id, query, asset.syncedLedger],
  );
  return (
    <div className="flex flex-col gap-6">
      <div className="max-w-xs">
        <Field label="As of" hint={`Empty shows the latest indexed ledger. ${LOCAL_TIME_HINT}`}>
          <input type="datetime-local" value={asOf} onChange={(e) => setAsOf(e.target.value)} className={inputClass} />
        </Field>
      </div>
      {error && <ErrorNote message={error} />}
      {loading && !data && <Skeleton rows={8} />}
      {data && (
        <>
          {data.incomplete.length > 0 && (
            <Notice>
              {data.incomplete.length} {data.incomplete.length === 1 ? "holder has" : "holders have"} a negative
              derived balance: the asset has history from before the indexed range. Rebuild its history from the
              asset's Settings to take fresh opening balances.
            </Notice>
          )}
          <Figures
            items={[
              { label: "Units outstanding", value: <Units value={data.supply} /> },
              { label: "Holders", value: data.holderCount },
              { label: "As of", value: <span className="text-sm font-medium">{when(data.asOf)}</span> },
              { label: "Last ledger applied", value: <span className="num">{data.ledger}</span> },
            ]}
          />
          {data.holders.length === 0 ? (
            <Empty title="No holders at this time">
              {asset.state === "indexing"
                ? "Holdings appear here once the asset's opening balances have been read."
                : "No balances existed for this asset at the chosen instant."}
            </Empty>
          ) : (
            <TableWrap>
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Address</th>
                    <th className="r">Units</th>
                    <th className="r">Share</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.holders.map((h) => (
                    <tr key={h.address}>
                      <td>
                        <span className="flex items-center gap-2">
                          <Addr value={h.address} />
                          {h.ignored && <Badge tone="neutral">Off register</Badge>}
                        </span>
                      </td>
                      <td className="r">
                        <Units value={h.units} />
                      </td>
                      <td className="r num">{h.share.toFixed(2)}%</td>
                      <td>{h.status ? <StatusBadge status={h.status} /> : <span className="text-xs text-muted">Not seen</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          )}
        </>
      )}
    </div>
  );
}
