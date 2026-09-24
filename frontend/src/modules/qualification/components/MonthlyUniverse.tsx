import { useState } from "react";
import type { ReactNode } from 'react';
import {
  App,
  Button,
  Descriptions,
  Drawer,
  Empty,
  Input,
  Popconfirm,
  Select,
  Table,
  Tag,
  Tooltip,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  ArrowRightOutlined,
  DownloadOutlined,
  DeleteOutlined,
  LockOutlined,
  PlayCircleOutlined,
  PlusOutlined,
  SearchOutlined,
} from "@ant-design/icons";
import { formatMonth } from "../../strategies/utils/monthlyCycle";
import { describeCondition } from "../config/metrics";
import { monthlyValue } from "../api/mockMonthly";
import type { CandidateStock, QualificationWorkspace } from "../types";
import { MonthlyRuleSummary } from './MonthlyRuleSummary';
import { StockIndexTags } from './StockIndexTags';
import { stockIndices, stockIndexLabel, type StockIndex } from '../config/stockIndices';
import { canEditQualifiedStocks } from '../utils/manualQualification';
import { useQualificationStore } from '../store/qualificationStore';
import { AddQualifiedStocksModal } from './AddQualifiedStocksModal';
import { QualificationSourceTag } from './QualificationSourceTag';

const number = (value: number) =>
  value.toLocaleString("en-IN", { maximumFractionDigits: 2 });
export function MonthlyUniverse({
  workspace,
  month,
  onRules,
  owner,
  onRun,
  canRun,
  running,
  activity,
}: {
  workspace: QualificationWorkspace;
  month: string;
  onRules: () => void;
  owner: string;
  onRun: () => void;
  canRun: boolean;
  running: boolean;
  activity?: ReactNode;
}) {
  const [search, setSearch] = useState("");
  const [sector, setSector] = useState("all");
  const [source, setSource] = useState<'all' | 'scan' | 'manual'>('all');
  const [selectedIndices, setSelectedIndices] = useState<StockIndex[]>([]);
  const [detailSymbol, setDetailSymbol] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const removeStock = useQualificationStore((state) => state.removeQualifiedStock);
  const removeAllManualStocks = useQualificationStore((state) => state.removeAllManualStocks);
  const { message } = App.useApp();
  const editable = canEditQualifiedStocks(workspace, month, month);
  const remove = (symbol: string) => {
    if (removeStock(owner, month, symbol)) {
      setDetailSymbol(null);
      message.success(`${symbol} removed from the qualified list.`);
    } else message.info('Only manually added stocks in the current list can be removed when no scan is pending.');
  };
  const removeAll = () => {
    const count = removeAllManualStocks(owner, month);
    if (count) { setDetailSymbol(null); message.success(`${count} manually added ${count === 1 ? 'stock removed' : 'stocks removed'}.`); }
    else message.info('No manual stocks were removed. Stock edits may be paused for a scan.');
  };
  const cache = workspace.caches[month];
  const candidates = cache?.candidates ?? [];
  const detail = candidates.find((stock) => stock.symbol === detailSymbol) ?? null;
  const manualCount = candidates.filter((stock) => stock.qualificationSource === 'manual').length;
  const filtered = candidates.filter(
    (stock) =>
      (sector === "all" || stock.sector === sector) &&
      (source === 'all' || (source === 'manual' ? stock.qualificationSource === 'manual' : stock.qualificationSource !== 'manual')) &&
      (!selectedIndices.length || selectedIndices.some((index) => stock.indices.includes(index))) &&
      `${stock.symbol} ${stock.name}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const columns: ColumnsType<CandidateStock> = [
    {
      title: "Stock",
      key: "stock",
      width: 275,
      render: (_, stock) => (
        <div>
        <button className="q-stock-link" onClick={() => setDetailSymbol(stock.symbol)}>
          <strong>{stock.symbol}</strong>
          <small>{stock.name}</small>
        </button>
        <QualificationSourceTag stock={stock} />
        <StockIndexTags indices={stock.indices} membershipMonth={month} />
        </div>
      ),
      sorter: (a, b) => a.symbol.localeCompare(b.symbol),
    },
    { title: "Sector", dataIndex: "sector", width: 125 },
    {
      title: "Monthly close (₹)",
      dataIndex: "close",
      align: "right",
      width: 105,
      render: number,
      sorter: (a, b) => a.close - b.close,
    },
    {
      title: "Mkt cap (₹ Cr)",
      dataIndex: "marketCap",
      align: "right",
      width: 120,
      render: number,
      sorter: (a, b) => a.marketCap - b.marketCap,
    },
    {
      title: "Monthly value (₹ Cr)",
      dataIndex: "turnover",
      align: "right",
      width: 125,
      render: (_, stock) => number(Number(monthlyValue(stock, 'tradedValue'))),
      sorter: (a, b) => a.turnover - b.turnover,
    },
    {
      title: "Debt / equity",
      dataIndex: "debtEquity",
      align: "right",
      width: 110,
      render: (value: number) => value.toFixed(2),
      sorter: (a, b) => a.debtEquity - b.debtEquity,
    },
    {
      title: "Pledge",
      dataIndex: "pledge",
      align: "right",
      width: 85,
      render: (value: number) => `${value}%`,
    },
    {
      title: "EMA 5 / 21 · Monthly",
      key: "trend",
      align: "right",
      width: 130,
      render: (_, stock) => (
        <span
          className={
            stock.qualificationSource === 'manual' ? undefined : Number(monthlyValue(stock, 'ema5')) >= Number(monthlyValue(stock, 'ema21'))
              ? "positive"
              : "negative"
          }
        >
          {Number(monthlyValue(stock, 'ema5')) >= Number(monthlyValue(stock, 'ema21')) ? "5 ≥ 21" : "5 < 21"}
        </span>
      ),
    },
    {
      title: 'Action', key: 'action', width: 108, fixed: 'right',
      render: (_, stock) => stock.qualificationSource === 'manual'
        ? <Popconfirm title={`Remove ${stock.symbol}?`} description="Only this manual addition will be removed." okText="Remove" cancelText="Keep stock" onConfirm={() => remove(stock.symbol)} disabled={!editable}>
          <Button type="text" size="small" danger icon={<DeleteOutlined aria-hidden />} aria-label={`Remove ${stock.symbol}`} disabled={!editable}>Remove</Button>
        </Popconfirm>
        : <Tooltip title="Qualified by monthly rules. Only manually added stocks can be removed."><span className="q-rule-qualified"><LockOutlined aria-hidden /> By rule</span></Tooltip>,
    },
  ];
  const exportRows = () => {
    const rows = [
      [
        "Symbol",
        "Name",
        "Sector",
        "Indices",
        "Qualification source",
        "Selection note",
        "Monthly close INR",
        "Market cap INR Cr",
        "Monthly traded value INR Cr",
        "Debt/equity",
        "Pledge %",
        "Cache month",
      ],
      ...filtered.map((stock) => [
        stock.symbol,
        stock.name,
        stock.sector,
        stock.indices.map(stockIndexLabel).join(' | '),
        stock.qualificationSource === 'manual' ? 'Manually added' : 'Monthly rules',
        stock.qualificationSource === 'manual' ? stock.manualSelectionNote ?? 'Selection criteria not recorded' : '',
        stock.close,
        stock.marketCap,
        monthlyValue(stock, 'tradedValue'),
        stock.debtEquity,
        stock.pledge,
        month,
      ]),
    ];
    const csv = rows
      .map((row) =>
        row
          .map((value) => `"${String(value).replaceAll('"', '""')}"`)
          .join(","),
      )
      .join("\r\n");
    const url = URL.createObjectURL(
      new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `qualified-stocks-${month}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <div className="q-universe">
      <div className="q-section-heading">
        <div>
          <h2>Your monthly candidate pool</h2>
          <p>
            Stocks qualified by your scan and manually added for the current month.
          </p>
        </div>
      </div>
      <div className="q-stat-grid">
        <div>
          <span>Market universe</span>
          <strong>{number(cache?.sourceCount ?? 6200)}</strong>
          <small>Stage 1 input · synthetic stocks</small>
        </div>
        <div>
          <span>Qualified candidates</span>
          <strong className="positive">
            {cache ? candidates.length : "—"}
          </strong>
          <small>
            {cache
              ? `${candidates.length - manualCount} by rule · ${manualCount} manually added`
              : "Monthly run pending"}
          </small>
        </div>
        <div>
          <span>Published scan rule</span>
          <strong className="q-stat-label">
            Monthly conditions
          </strong>
          <small>
            {cache
              ? 'Applies to scan selections only'
              : "Save and run monthly rules"}
          </small>
        </div>
        <div>
          <span>Cache status</span>
          <strong className="q-stat-label">
            {cache ? (
              <>
                <LockOutlined /> Saved snapshot
              </>
            ) : (
              "Not created"
            )}
          </strong>
          <small>
            {cache
              ? `Updated ${new Date(cache.createdAt).toLocaleDateString("en-GB", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short" })}`
              : "Run Stage 1 to begin"}
          </small>
        </div>
      </div>
      <div className="q-cache-banner">
        <div>
          <LockOutlined />
          <span>
            {cache ? (
              <>
                <strong>{formatMonth(month)}</strong> · Published candidates{cache.dataMonth ? ` · Monthly data through ${formatMonth(cache.dataMonth)}` : ''}.
              </>
            ) : (
              <>
                No cached candidates for <strong>{formatMonth(month)}</strong>.
              </>
            )}
          </span>
        </div>
        <div className="monthly-banner-actions">
          <Button type="primary" size="small" aria-label="Run" icon={<PlayCircleOutlined aria-hidden />} loading={running} disabled={!canRun} onClick={onRun}>Run</Button>
          <Button
            size="small"
            type="default"
            icon={<ArrowRightOutlined />}
            onClick={onRules}
          >
            Edit monthly rules
          </Button>
        </div>
      </div>
      {activity}
      {cache ? (
        <>
          <div className="monthly-stock-actions">
            <Button icon={<PlusOutlined aria-hidden />} disabled={!editable} onClick={() => setAdding(true)}>Add stock</Button>
            <Popconfirm title={`Remove all ${manualCount} manually added stocks?`} description="This removes every manual addition for the current month, including stocks hidden by filters. Stocks qualified by the scan stay in the list." okText="Remove all" cancelText="Keep stocks" okButtonProps={{ danger: true }} onConfirm={removeAll} disabled={!editable || !manualCount} overlayClassName="monthly-bulk-confirm">
              <Button danger icon={<DeleteOutlined aria-hidden />} disabled={!editable || !manualCount}>Remove all manually added</Button>
            </Popconfirm>
            <Button icon={<DownloadOutlined />} disabled={!filtered.length} onClick={exportRows}>Export list</Button>
          </div>
          <div className="monthly-stock-filters">
            <Input
              allowClear
              prefix={<SearchOutlined />}
              aria-label="Search qualified stocks"
              placeholder="Search symbol or company"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <Select
              aria-label="Filter candidates by sector"
              showSearch
              allowClear
              optionFilterProp="label"
              placeholder="All sectors"
              value={sector === 'all' ? undefined : sector}
              onChange={(value) => setSector(value ?? 'all')}
              options={[
                { value: "all", label: "All sectors" },
                ...[...new Set(candidates.map((stock) => stock.sector))]
                  .sort()
                  .map((value) => ({ value, label: value })),
              ]}
            />
            <Select
              className="q-index-filter"
              mode="multiple"
              allowClear
              maxTagCount="responsive"
              aria-label="Filter candidates by index"
              placeholder="All indices"
              value={selectedIndices}
              onChange={setSelectedIndices}
              optionFilterProp="label"
              options={stockIndices.map((index) => ({
                ...index,
                label: index.label,
                count: candidates.filter((stock) => stock.indices.includes(index.value)).length,
              }))}
              optionRender={(option) => <span>{option.label} <span className="q-index-option-count">({option.data.count})</span></span>}
            />
            <Select aria-label="Filter candidates by source" value={source} onChange={setSource} options={[
              { value: 'all', label: 'All sources', count: candidates.length },
              { value: 'scan', label: 'From scan', count: candidates.length - manualCount },
              { value: 'manual', label: 'Manually added', count: manualCount },
            ]} optionRender={(option) => <span>{option.label} <span className="q-index-option-count">({option.data.count})</span></span>} />
          </div>
          <div className="q-index-filter-note">
            <span><strong>{filtered.length} of {candidates.length} candidates</strong>{selectedIndices.length > 0 && ' · Matches any selected index'}</span>
            <span>{manualCount > 0 ? `${manualCount} manually added · ` : ''}Only manually added stocks can be removed.</span>
          </div>
          {!editable && <p className="q-manual-help">Stock edits are paused while a scan is running or awaiting review.</p>}
          <Table
            className="q-candidate-table"
            rowKey="symbol"
            columns={columns}
            dataSource={filtered}
            size="small"
            scroll={{ x: 1283 }}
            pagination={{
              pageSize: 10,
              showSizeChanger: false,
              showTotal: (total) => `${total} candidates`,
            }}
            locale={{
              emptyText: candidates.length
                ? "No candidates match your search."
                : "No stocks passed the saved monthly rule. Edit conditions and run a new scan.",
            }}
          />
        </>
      ) : (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="No published list for this month. Save your monthly rules, run a scan, then review and publish the result."
        >
          <Button onClick={onRules}>Review monthly rules</Button>
        </Empty>
      )}
      <div className="q-monthly-footer">
        <div>
          <strong>
            Monthly qualification rules
          </strong>
          <p>
            Save condition changes to enable Run for the current month.
          </p>
        </div>
        <Button type="link" onClick={onRules}>
          Edit rules <ArrowRightOutlined />
        </Button>
      </div>
      <Drawer
        open={!!detail}
        onClose={() => setDetailSymbol(null)}
        title={detail ? `${detail.symbol} · Qualification details` : ""}
        size={490}
      >
        {detail && cache && (
          <div className="q-stock-detail">
            <h3>{detail.name}</h3>
            <p>{detail.sector} · Synthetic metrics</p>
            <StockIndexTags indices={detail.indices} membershipMonth={month} />
            {detail.qualificationSource === 'manual' ? <div className="q-manual-selection">
              <QualificationSourceTag stock={detail} />
              <h4>Your custom selection</h4>
              <p>Included by you for {formatMonth(month)}. Your criteria may differ from the monthly rules and are not evaluated by the platform.</p>
              <strong>Selection note</strong>
              <p className="q-selection-note">{detail.manualSelectionNote || 'Selection criteria not recorded.'}</p>
              <small>Manual inclusion does not indicate a monthly rule pass. Trading signals still require your algo rules.</small>
            </div> : <Tag color="green">Passed Stage 1 · {month}</Tag>}
            <h4>Stock metrics</h4>
            {detail.qualificationSource === 'manual' && <p className="q-manual-help">For reference only · These values are not checks against your custom criteria.</p>}
            <Descriptions
              column={1}
              size="small"
              items={[
                {
                  key: "cap",
                  label: "Market cap",
                  children: `₹${number(detail.marketCap)} Cr`,
                },
                {
                  key: "turnover",
                  label: "Monthly traded value",
                  children: `₹${number(Number(monthlyValue(detail, 'tradedValue')))} Cr`,
                },
                {
                  key: "debt",
                  label: "Debt / equity",
                  children: detail.debtEquity,
                },
                {
                  key: "pledge",
                  label: "Promoter pledge",
                  children: `${detail.pledge}%`,
                },
                {
                  key: "base",
                  label: "Qualification source",
                  children: detail.qualificationSource === 'manual' ? 'Manually added' : 'From scan',
                },
              ]}
            />
            {detail.qualificationSource !== 'manual' && <>
            <h4>Conditions used by the published scan</h4>
            <p className="q-manual-help">These are the rules that produced this list. Later edits apply only after a new scan is published.</p>
            {cache.rule.tier === 'monthly' ? <MonthlyRuleSummary rule={cache.rule} /> : <><p>Earlier saved rule · Combine groups with {cache.rule.logic}</p>
            {cache.rule.groups.map((group, index) => (
              <div className="q-detail-group" key={index}>
                <strong>
                  Group {index + 1} · {group.logic}
                </strong>
                <ul>
                  {group.conditions.map((condition, i) => (
                    <li key={i}>{describeCondition(condition)}</li>
                  ))}
                </ul>
              </div>
            ))}</>}
            </>}
          </div>
        )}
      </Drawer>
      {adding && <AddQualifiedStocksModal owner={owner} month={month} candidates={candidates} enabled={editable} onClose={() => setAdding(false)} />}
    </div>
  );
}
