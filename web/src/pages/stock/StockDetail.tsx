import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  AreaChartOutlined,
  BankOutlined,
  ClockCircleOutlined,
  CompressOutlined,
  DollarOutlined,
  ExpandOutlined,
  GiftOutlined,
  InfoCircleOutlined,
  LineChartOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import {
  Button,
  Card,
  Col,
  Descriptions,
  Empty,
  Flex,
  List,
  Progress,
  Row,
  Space,
  Spin,
  Statistic,
  Table,
  Tabs,
  Tag,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { api } from '../../api/client';
import type { MinuteItem, Signal, SignalAnalysis as SignalAnalysisType, XdXrItem } from '../../types/api';
import CandlestickChart from '../../components/charts/CandlestickChart';
import ChartToolbar from '../../components/charts/ChartToolbar';
import MinuteChart from '../../components/charts/MinuteChart';
import StockSearchInput from '../../components/StockSearchInput';
import TabContent from '../../components/TabContent';
import { parseTdxText, renderTdxHtml } from '../../lib/tdx-parser';

type Tab = 'chart' | 'finance' | 'company' | 'dividend' | 'intraday';
type DetailStatus = 'loading' | 'ready' | 'not_found' | 'no_data';

const TAB_ITEMS: { key: Tab; label: string; icon: React.ReactNode }[] = [
  { key: 'chart', label: 'K线+指标', icon: <AreaChartOutlined /> },
  { key: 'finance', label: '财务', icon: <DollarOutlined /> },
  { key: 'company', label: '公司', icon: <BankOutlined /> },
  { key: 'dividend', label: '分红', icon: <GiftOutlined /> },
  { key: 'intraday', label: '分时', icon: <ClockCircleOutlined /> },
];

function getLastTradingDay(): string {
  const today = new Date();
  const dayOfWeek = today.getDay();
  let adjustDays = 1;
  if (dayOfWeek === 0) adjustDays = 2;
  else if (dayOfWeek === 1) adjustDays = 3;

  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - adjustDays);

  const year = yesterday.getFullYear();
  const month = String(yesterday.getMonth() + 1).padStart(2, '0');
  const day = String(yesterday.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

function getDetailErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

function classifyDetailStatus(error: unknown): DetailStatus {
  const message = error instanceof Error ? error.message : '';
  if (message.includes('未找到') || message.includes('多个匹配股票')) return 'not_found';
  return 'no_data';
}

function getValueColor(value: number) {
  if (value > 0) return '#ef4444';
  if (value < 0) return '#22c55e';
  return '#cbd5e1';
}

function formatSigned(value: number, suffix = '') {
  return `${value > 0 ? '+' : ''}${value.toFixed(2)}${suffix}`;
}

export default function StockDetail() {
  const { code: paramCode, tab: paramTab } = useParams();
  const navigate = useNavigate();
  const [code, setCode] = useState(paramCode || '');
  const [tab, setTab] = useState<Tab>((paramTab as Tab) || 'chart');
  const [quote, setQuote] = useState<any>(null);
  const [klines, setKlines] = useState<any[]>([]);
  const [indicator, setIndicator] = useState<any>(null);
  const [ktype, setKtype] = useState('day');
  const [mainOverlay, setMainOverlay] = useState('MA');
  const [subPanel, setSubPanel] = useState('MACD');
  const [finance, setFinance] = useState<any>(null);
  const [companyCats, setCompanyCats] = useState<any[]>([]);
  const [companyContent, setCompanyContent] = useState('');
  const [selectedCat, setSelectedCat] = useState('');
  const [dividends, setDividends] = useState<any[]>([]);
  const [minuteData, setMinuteData] = useState<any[]>([]);
  const [minuteDate, setMinuteDate] = useState<string>('');
  const [analysis, setAnalysis] = useState<SignalAnalysisType | null>(null);
  const [highlightedIdx, setHighlightedIdx] = useState(-1);
  const [fullscreen, setFullscreen] = useState(false);
  const tradeRowRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const [loading, setLoading] = useState(false);
  const [detailStatus, setDetailStatus] = useState<DetailStatus>('loading');
  const [detailError, setDetailError] = useState('');

  useEffect(() => {
    if (!paramCode) {
      navigate('/stock/choose');
      return;
    }
    setCode(paramCode);
    if (paramTab) setTab(paramTab as Tab);
  }, [paramCode, paramTab, navigate]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFullscreen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const switchTab = (nextTab: Tab) => {
    setTab(nextTab);
    navigate(`/stock/${code}/${nextTab}`, { replace: true });
  };

  const loadCompanyContent = async (catName: string) => {
    setSelectedCat(catName);
    try {
      const r = await api.companyContent(code, catName);
      setCompanyContent((r.content || '').replace(/\r/g, ''));
    } catch {
      setCompanyContent('加载失败');
    }
  };

  useEffect(() => {
    if (!code) return;
    let cancelled = false;
    setLoading(true);
    setDetailStatus('loading');
    setDetailError('');
    setQuote(null);
    setIndicator(null);
    setKlines([]);
    setAnalysis(null);
    setFinance(null);
    setCompanyCats([]);
    setCompanyContent('');
    setSelectedCat('');
    setDividends([]);
    setMinuteData([]);
    setMinuteDate('');

    const loadCore = async () => {
      const [quoteResult, indicatorResult, analysisResult] = await Promise.allSettled([
        api.quote(code),
        api.indicator(code, ktype),
        api.signalAnalysis(code, ktype),
      ]);

      if (cancelled) return;

      if (quoteResult.status === 'rejected') {
        setDetailStatus('not_found');
        setDetailError(getDetailErrorMessage(quoteResult.reason, '未找到匹配股票或行情数据'));
        setLoading(false);
        return;
      }

      setQuote(quoteResult.value);

      if (indicatorResult.status === 'rejected') {
        setDetailStatus(classifyDetailStatus(indicatorResult.reason));
        setDetailError(getDetailErrorMessage(indicatorResult.reason, '该股票暂无可展示的数据'));
        setLoading(false);
        return;
      }

      const indicatorData = indicatorResult.value;
      const nextKlines = indicatorData?.klines || [];
      setIndicator(indicatorData);
      setKlines(nextKlines);

      if (nextKlines.length === 0) {
        setDetailStatus('no_data');
        setDetailError('该股票暂无可展示的K线数据');
        setLoading(false);
        return;
      }

      if (analysisResult.status === 'fulfilled') setAnalysis(analysisResult.value);
      setDetailStatus('ready');
      api.historyAdd(code, quoteResult.value.Name).catch(() => {});
      setLoading(false);
    };

    loadCore().catch((error) => {
      if (cancelled) return;
      setDetailStatus(classifyDetailStatus(error));
      setDetailError(getDetailErrorMessage(error, '加载股票详情失败'));
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [code, ktype]);

  useEffect(() => {
    if (!code || detailStatus !== 'ready') return;
    if (tab === 'finance') api.finance(code).then(setFinance).catch(() => {});
    if (tab === 'company') api.company(code).then((cats) => {
      setCompanyCats(cats);
      if (cats.length > 0 && !selectedCat) void loadCompanyContent(cats[0].Name);
    }).catch(() => {});
    if (tab === 'dividend') api.xdxr(code).then((d) => setDividends([...d].reverse())).catch(() => {});
    if (tab === 'intraday') {
      const fetchMinute = async () => {
        try {
          const r = await api.minute(code);
          if (r.List && r.List.length > 0) {
            setMinuteData(r.List);
            const today = new Date();
            setMinuteDate(today.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' }));
          } else {
            const yesterday = getLastTradingDay();
            try {
              const histR = await api.minuteHistory(code, yesterday);
              if (histR.List && histR.List.length > 0) {
                setMinuteData(histR.List);
                setMinuteDate(`${yesterday.slice(4, 6)}-${yesterday.slice(6, 8)}`);
              }
            } catch {
              // ignore historical minute errors
            }
          }
        } catch {
          // ignore minute errors
        }
        api.quote(code).then(setQuote).catch(() => {});
      };
      void fetchMinute();
      api.finance(code).then(setFinance).catch(() => {});
      const timer = setInterval(fetchMinute, 30000);
      return () => clearInterval(timer);
    }
  }, [code, tab, detailStatus]);

  const pct = quote ? ((quote.Price - quote.LastClose) / quote.LastClose) * 100 : 0;
  const up = pct >= 0;
  const showTabs = detailStatus === 'ready';
  const valueColor = getValueColor(pct);
  const latestSignals = indicator?.signals?.slice(-3).reverse() ?? [];
  const latestClose = klines.length > 0 ? klines[klines.length - 1].Close : undefined;

  const financeItems = finance ? [
    ['总股本', finance.ZongGuBen, '万股'],
    ['流通股本', finance.LiuTongGuBen, '万股'],
    ['总资产', finance.ZongZiChan, '万元'],
    ['净资产', finance.JingZiChan, '万元'],
    ['主营收入', finance.ZhuYingShouRu, '万元'],
    ['净利润', finance.JingLiRun, '万元'],
    ['每股净资产', finance.MeiGuJingZiChan, '元'],
    ['股东人数', finance.GuDongRenShu, '人'],
  ] : [];

  const dividendColumns: ColumnsType<XdXrItem> = [
    { title: '日期', dataIndex: 'Date', render: (value) => value?.slice(0, 10) },
    { title: '类型', dataIndex: 'Category' },
    { title: '分红(元)', dataIndex: 'FenHong', align: 'right', render: (value) => value > 0 ? value.toFixed(4) : '-' },
    { title: '送转(股)', dataIndex: 'SongZhuanGu', align: 'right', render: (value) => value > 0 ? value.toFixed(2) : '-' },
    { title: '配股价', dataIndex: 'PeiGuJia', align: 'right', render: (value) => value > 0 ? value.toFixed(2) : '-' },
    { title: '流通盘', dataIndex: 'PanHouLiuTong', align: 'right', render: (value) => value > 0 ? `${(value / 10000).toFixed(1)}万` : '-' },
    { title: '总股本', dataIndex: 'HouZongGuBen', align: 'right', render: (value) => value > 0 ? `${(value / 10000).toFixed(1)}万` : '-' },
  ];

  const minuteColumns: ColumnsType<MinuteItem> = useMemo(() => {
    const lastClose = quote?.LastClose || 0;
    return [
      { title: '时间', dataIndex: 'Time', width: 90 },
      {
        title: '价格',
        dataIndex: 'Price',
        align: 'right',
        render: (value: number) => <span className={value >= lastClose ? 'price-up' : 'price-down'}>{value.toFixed(2)}</span>,
      },
      {
        title: '涨跌',
        align: 'right',
        render: (_, row) => {
          const chg = row.Price - lastClose;
          return <span className={chg >= 0 ? 'price-up' : 'price-down'}>{chg > 0 ? '+' : ''}{chg.toFixed(2)}</span>;
        },
      },
      {
        title: '涨幅',
        align: 'right',
        render: (_, row) => {
          const chgPct = lastClose > 0 ? ((row.Price - lastClose) / lastClose) * 100 : 0;
          return <span className={chgPct >= 0 ? 'price-up' : 'price-down'}>{chgPct > 0 ? '+' : ''}{chgPct.toFixed(2)}%</span>;
        },
      },
      { title: '成交量', dataIndex: 'Number', align: 'right', render: (value: number) => `${Math.abs(value).toLocaleString()}手` },
    ];
  }, [quote]);

  const selectedMinute = highlightedIdx >= 0 && highlightedIdx < minuteData.length ? minuteData[highlightedIdx] : null;

  return (
    <div style={fullscreen ? { position: 'fixed', inset: 0, zIndex: 1000, background: '#0b1220', padding: 24, overflow: 'auto' } : undefined}>
      <Space direction="vertical" size={16} style={{ display: 'flex' }}>
        <Card bordered={false} style={{ background: 'linear-gradient(135deg, rgba(30,41,59,0.95), rgba(15,23,42,0.92))' }}>
          <Flex justify="space-between" align="flex-start" gap={16} wrap>
            <Space direction="vertical" size={14} style={{ flex: 1, minWidth: 280 }}>
              {!fullscreen && (
                <StockSearchInput
                  key={code}
                  initialQuery={code}
                  limit={10}
                  placeholder="代码/名称/拼音"
                  containerClassName="stock-detail-search"
                  onSelect={(match) => navigate(`/stock/${match.code}/${tab}`)}
                />
              )}
              {showTabs && quote && (
                <Space direction="vertical" size={12} style={{ display: 'flex' }}>
                  <Space wrap size={[8, 8]}>
                    <Tag color="blue">{quote.Code || code}</Tag>
                    <Tag color={ktype === 'day' ? 'geekblue' : 'purple'}>{ktype.toUpperCase()}</Tag>
                    <Tag color={detailStatus === 'ready' ? 'success' : 'default'}>实时分析</Tag>
                  </Space>
                  <Space wrap size={[8, 8]} align="center">
                    <Typography.Title level={2} style={{ margin: 0 }}>{quote.Name}</Typography.Title>
                    <Typography.Text style={{ fontSize: 32, fontWeight: 700, color: valueColor }}>
                      {quote.Price?.toFixed(2)}
                    </Typography.Text>
                    <Tag color={up ? 'red' : 'green'}>{formatSigned(pct, '%')}</Tag>
                    <Typography.Text style={{ color: valueColor }}>
                      {formatSigned(quote.Price - quote.LastClose)}
                    </Typography.Text>
                  </Space>
                  <Typography.Text type="secondary">
                    结合行情、技术指标、分时与 F10 数据，适合做单只股票的快速研判。
                  </Typography.Text>
                </Space>
              )}
            </Space>
            <Button
              icon={fullscreen ? <CompressOutlined /> : <ExpandOutlined />}
              onClick={() => setFullscreen(!fullscreen)}
            >
              {fullscreen ? '退出全屏' : '全屏'}
            </Button>
          </Flex>
        </Card>

        {showTabs && quote && (
          <>
            <Row gutter={[16, 16]}>
              <Col xs={24} xl={16}>
                <Card>
                  <Row gutter={[16, 16]}>
                    <Col xs={12} md={8} xl={4}><Statistic title="昨收" value={quote.LastClose} precision={2} /></Col>
                    <Col xs={12} md={8} xl={4}><Statistic title="开盘" value={quote.Open} precision={2} /></Col>
                    <Col xs={12} md={8} xl={4}><Statistic title="最高" value={quote.High} precision={2} valueStyle={{ color: '#ef4444' }} /></Col>
                    <Col xs={12} md={8} xl={4}><Statistic title="最低" value={quote.Low} precision={2} valueStyle={{ color: '#22c55e' }} /></Col>
                    <Col xs={12} md={8} xl={4}><Statistic title="成交量" value={quote.Volume / 10000} suffix="万" precision={0} /></Col>
                    <Col xs={12} md={8} xl={4}><Statistic title="成交额" value={quote.Amount / 10000} suffix="万" precision={0} /></Col>
                  </Row>
                </Card>
              </Col>
              <Col xs={24} xl={8}>
                <Card title={<Space><ThunderboltOutlined />最新信号</Space>}>
                  {latestSignals.length > 0 ? (
                    <Space direction="vertical" size={10} style={{ display: 'flex' }}>
                      {latestSignals.map((signal: Signal) => (
                        <Flex key={`${signal.Date}-${signal.Type}-${signal.Indicator}`} justify="space-between" align="center" gap={12}>
                          <Space direction="vertical" size={2}>
                            <Typography.Text strong>{signal.Type}</Typography.Text>
                            <Typography.Text type="secondary">{signal.Date} · {signal.Indicator}</Typography.Text>
                          </Space>
                          <Tag color={signal.Strength >= 0 ? 'red' : 'green'}>{signal.Details || '触发'}</Tag>
                        </Flex>
                      ))}
                    </Space>
                  ) : (
                    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无最新信号" />
                  )}
                </Card>
              </Col>
            </Row>

            <Row gutter={[16, 16]}>
              <Col xs={24} xl={8}>
                <Card>
                  <Statistic
                    title="最新收盘价"
                    value={latestClose}
                    precision={2}
                    valueStyle={{ color: latestClose ? valueColor : undefined }}
                    prefix={<LineChartOutlined />}
                  />
                </Card>
              </Col>
              <Col xs={24} xl={8}>
                <Card>
                  <Statistic
                    title="信号回测样本"
                    value={analysis?.signals ?? 0}
                    suffix={`/ ${analysis?.count ?? 0}`}
                  />
                </Card>
              </Col>
              <Col xs={24} xl={8}>
                <Card>
                  <Space direction="vertical" size={8} style={{ display: 'flex' }}>
                    <Typography.Text type="secondary">上涨/下跌强度</Typography.Text>
                    <Progress
                      percent={Math.min(100, Math.max(0, 50 + pct * 5))}
                      strokeColor={up ? '#ef4444' : '#22c55e'}
                      showInfo={false}
                    />
                    <Typography.Text>{formatSigned(pct, '%')}</Typography.Text>
                  </Space>
                </Card>
              </Col>
            </Row>
          </>
        )}

        {loading && (
          <Card><Flex justify="center" align="center" style={{ minHeight: 240 }}><Spin size="large" /></Flex></Card>
        )}

        {!loading && !showTabs && (
          <Card>
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={
                <Space direction="vertical" size={4}>
                  <Typography.Text strong>
                    {detailStatus === 'not_found' ? '未找到该股票' : '该股票暂无可展示的数据'}
                  </Typography.Text>
                  <Typography.Text type="secondary">{detailError || '请重新搜索并选择一个有效的股票。'}</Typography.Text>
                </Space>
              }
            />
          </Card>
        )}

        {showTabs && (
          <Tabs
            activeKey={tab}
            onChange={(key) => switchTab(key as Tab)}
            items={TAB_ITEMS.map((item) => ({ key: item.key, label: <Space>{item.icon}{item.label}</Space> }))}
          />
        )}

        {showTabs && tab === 'chart' && klines.length > 0 && (
          <Space direction="vertical" size={16} style={{ display: 'flex' }}>
            <Card><ChartToolbar ktype={ktype} onKtypeChange={setKtype} mainOverlay={mainOverlay} onMainOverlayChange={setMainOverlay} subPanel={subPanel} onSubPanelChange={setSubPanel} /></Card>
            <Card bodyStyle={{ padding: 0 }}><CandlestickChart klines={klines} indicator={indicator} mainOverlay={mainOverlay} subPanel={subPanel} /></Card>
            {analysis && analysis.summary.length > 0 && (
              <Card title="信号回测" extra={<Typography.Text type="secondary">基于历史 {analysis.count} 根K线中的 {analysis.signals} 个信号</Typography.Text>}>
                <Table
                  pagination={false}
                  rowKey={(row) => row.type}
                  size="small"
                  dataSource={analysis.summary}
                  columns={[
                    { title: '信号', dataIndex: 'type' },
                    { title: '建议', dataIndex: 'action', render: (value) => <Tag color={value === '买入参考' ? 'red' : 'green'}>{value}</Tag> },
                    { title: '触发次数', dataIndex: 'count', align: 'right' },
                    { title: '次日上涨率', dataIndex: 'win1', align: 'right', render: (_, row) => row.valid1 > 0 ? `${row.win1.toFixed(0)}% (${row.valid1})` : '-' },
                    { title: '5日上涨率', dataIndex: 'win5', align: 'right', render: (_, row) => row.valid5 > 0 ? `${row.win5.toFixed(0)}% (${row.valid5})` : '-' },
                    { title: '10日上涨率', dataIndex: 'win10', align: 'right', render: (_, row) => row.valid10 > 0 ? `${row.win10.toFixed(0)}% (${row.valid10})` : '-' },
                    { title: '20日上涨率', dataIndex: 'win20', align: 'right', render: (_, row) => row.valid20 > 0 ? `${row.win20.toFixed(0)}% (${row.valid20})` : '-' },
                    { title: '次日均涨幅', dataIndex: 'avg1', align: 'right', render: (value, row) => row.valid1 > 0 ? `${value > 0 ? '+' : ''}${value.toFixed(2)}%` : '-' },
                    { title: '5日均涨幅', dataIndex: 'avg5', align: 'right', render: (value, row) => row.valid5 > 0 ? `${value > 0 ? '+' : ''}${value.toFixed(2)}%` : '-' },
                  ]}
                />
              </Card>
            )}
            {analysis && analysis.outcomes.length > 0 && (
              <Card title="信号明细">
                <Table
                  size="small"
                  pagination={{ pageSize: 10 }}
                  rowKey={(row) => `${row.date}-${row.type}-${row.indicator}`}
                  dataSource={[...analysis.outcomes].reverse()}
                  columns={[
                    { title: '日期', dataIndex: 'date' },
                    { title: '指标', dataIndex: 'indicator' },
                    { title: '信号', dataIndex: 'type' },
                    { title: '建议', dataIndex: 'action', render: (value) => <Tag color={value === '买入参考' ? 'red' : 'green'}>{value}</Tag> },
                    { title: '触发价', dataIndex: 'price', align: 'right', render: (value) => value.toFixed(2) },
                    { title: '次日涨跌', dataIndex: 'chg1', align: 'right', render: (value) => formatChange(value) },
                    { title: '5日涨跌', dataIndex: 'chg5', align: 'right', render: (value) => formatChange(value) },
                    { title: '10日涨跌', dataIndex: 'chg10', align: 'right', render: (value) => formatChange(value) },
                    { title: '20日涨跌', dataIndex: 'chg20', align: 'right', render: (value) => formatChange(value) },
                  ]}
                />
              </Card>
            )}
          </Space>
        )}

        {showTabs && tab === 'finance' && finance && (
          <Card title="财务概览">
            <Descriptions bordered column={{ xs: 1, md: 2, xl: 4 }}>
              {financeItems.map(([label, value, unit]) => (
                <Descriptions.Item key={String(label)} label={label}>
                  {typeof value === 'number' ? value.toLocaleString() : value} {unit}
                </Descriptions.Item>
              ))}
            </Descriptions>
          </Card>
        )}

        {showTabs && tab === 'company' && (
          <TabContent>
            <Row gutter={[16, 16]}>
              <Col xs={24} lg={6}>
                <Card title="F10目录">
                  <List
                    size="small"
                    dataSource={companyCats}
                    renderItem={(cat) => (
                      <List.Item>
                        <Button type={selectedCat === cat.Name ? 'primary' : 'text'} block onClick={() => void loadCompanyContent(cat.Name)}>
                          {cat.Name}
                        </Button>
                      </List.Item>
                    )}
                  />
                </Card>
              </Col>
              <Col xs={24} lg={18}>
                <Card title={<Space><InfoCircleOutlined />内容</Space>}>
                  {companyContent ? (
                    <div className="tdx-content text-sm text-slate-300" dangerouslySetInnerHTML={{ __html: renderTdxHtml(parseTdxText(companyContent)) }} />
                  ) : (
                    <Empty description="点击左侧目录查看内容" />
                  )}
                </Card>
              </Col>
            </Row>
          </TabContent>
        )}

        {showTabs && tab === 'dividend' && (
          <Card title="分红与除权除息">
            <Table rowKey={(row) => `${row.Date}-${row.Category}`} columns={dividendColumns} dataSource={dividends} size="small" pagination={{ pageSize: 12 }} />
          </Card>
        )}

        {showTabs && tab === 'intraday' && minuteData.length > 0 && (() => {
          const lastClose = quote?.LastClose || 0;
          let totalAmount = 0;
          let totalVolume = 0;
          minuteData.forEach((m) => {
            const vol = Math.abs(m.Number);
            totalAmount += m.Price * vol;
            totalVolume += vol;
          });
          const vwap = totalVolume > 0 ? totalAmount / totalVolume : lastClose;
          const sVol = quote?.SVol || 0;
          const bVol = quote?.BVol || 0;
          const innerVol = Math.abs(sVol);
          const outerVol = Math.abs(bVol);
          const totalVol = innerVol + outerVol;
          const innerPct = totalVol > 0 ? (innerVol / totalVol) * 100 : 50;
          const outerPct = totalVol > 0 ? (outerVol / totalVol) * 100 : 50;
          const turnover = finance?.LiuTongGuBen > 0 ? ((quote?.Volume || 0) / finance.LiuTongGuBen) * 100 : 0;

          return (
            <Space direction="vertical" size={16} style={{ display: 'flex' }}>
              <Card>
                <Space wrap size={[16, 12]}>
                  <Typography.Text type="secondary">{minuteDate || new Date().toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit', weekday: 'short' })}</Typography.Text>
                  <Typography.Text>昨收 {lastClose.toFixed(2)}</Typography.Text>
                  <Typography.Text>均价 <span className={vwap >= lastClose ? 'price-up' : 'price-down'}>{vwap.toFixed(2)}</span></Typography.Text>
                  <Typography.Text>内盘 {(innerVol / 10000).toFixed(0)}万 ({innerPct.toFixed(1)}%)</Typography.Text>
                  <Typography.Text>外盘 {(outerVol / 10000).toFixed(0)}万 ({outerPct.toFixed(1)}%)</Typography.Text>
                  {turnover > 0 && <Typography.Text>换手 {turnover.toFixed(2)}%</Typography.Text>}
                </Space>
              </Card>
              <Row gutter={[16, 16]}>
                <Col xs={24} xl={15}>
                  <Card bodyStyle={{ padding: 0 }}>
                    <MinuteChart
                      data={minuteData}
                      lastClose={lastClose}
                      onClickIndex={(idx) => {
                        setHighlightedIdx(idx);
                        const tableIdx = minuteData.length - 1 - idx;
                        const el = tradeRowRefs.current[tableIdx];
                        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                      }}
                    />
                  </Card>
                  {selectedMinute && (
                    <Card size="small" style={{ marginTop: 12 }}>
                      <Space wrap>
                        <Typography.Text>选中: {selectedMinute.Time}</Typography.Text>
                        <Typography.Text>价格: {selectedMinute.Price.toFixed(2)}</Typography.Text>
                        <Typography.Text>成交量: {Math.abs(selectedMinute.Number).toLocaleString()}手</Typography.Text>
                        <Button size="small" onClick={() => setHighlightedIdx(-1)}>清除选择</Button>
                      </Space>
                    </Card>
                  )}
                </Col>
                <Col xs={24} xl={9}>
                  <Card title="成交明细">
                    <Table
                      size="small"
                      pagination={{ pageSize: 12 }}
                      rowKey={(row, index) => `${row.Time}-${index}`}
                      dataSource={[...minuteData].reverse()}
                      columns={minuteColumns}
                      onRow={(_, rowIndex) => ({
                        onClick: () => {
                          if (typeof rowIndex === 'number') setHighlightedIdx(minuteData.length - 1 - rowIndex);
                        },
                      })}
                    />
                  </Card>
                </Col>
              </Row>
            </Space>
          );
        })()}
      </Space>
    </div>
  );
}

function formatChange(value: number | null | undefined) {
  if (value === null || value === undefined) return '-';
  return <span className={value >= 0 ? 'price-up' : 'price-down'}>{value > 0 ? '+' : ''}{value.toFixed(2)}%</span>;
}
