import { Radio, Segmented, Space, Typography } from 'antd';

interface Props {
  ktype: string;
  onKtypeChange: (ktype: string) => void;
  mainOverlay: string;
  onMainOverlayChange: (v: string) => void;
  subPanel: string;
  onSubPanelChange: (v: string) => void;
}

const KTYPES = [
  { value: '1m', label: '1分' },
  { value: '5m', label: '5分' },
  { value: '15m', label: '15分' },
  { value: '30m', label: '30分' },
  { value: '60m', label: '60分' },
  { value: 'day', label: '日K' },
  { value: 'week', label: '周K' },
  { value: 'month', label: '月K' },
];

const MAIN_OVERLAYS = [
  { value: 'MA', label: 'MA' },
  { value: 'BOLL', label: 'BOLL' },
];

const SUB_PANELS = [
  { value: 'MACD', label: 'MACD' },
  { value: 'KDJ', label: 'KDJ' },
  { value: 'RSI', label: 'RSI' },
];

export default function ChartToolbar({
  ktype,
  onKtypeChange,
  mainOverlay,
  onMainOverlayChange,
  subPanel,
  onSubPanelChange,
}: Props) {
  return (
    <Space direction="vertical" size={12} style={{ display: 'flex' }}>
      <Segmented options={KTYPES} value={ktype} onChange={(value) => onKtypeChange(String(value))} block />
      <Space wrap size={16} align="center">
        <Space size={8} align="center">
          <Typography.Text type="secondary">主图</Typography.Text>
          <Radio.Group
            optionType="button"
            buttonStyle="solid"
            options={MAIN_OVERLAYS}
            value={mainOverlay || undefined}
            onChange={(event) => onMainOverlayChange(event.target.value === mainOverlay ? '' : event.target.value)}
          />
        </Space>
        <Space size={8} align="center">
          <Typography.Text type="secondary">副图</Typography.Text>
          <Radio.Group
            optionType="button"
            buttonStyle="solid"
            options={SUB_PANELS}
            value={subPanel || undefined}
            onChange={(event) => onSubPanelChange(event.target.value === subPanel ? '' : event.target.value)}
          />
        </Space>
      </Space>
    </Space>
  );
}
