import { Checkbox, Segmented, Space } from 'antd';

export function ChartAppearanceControls({ kind, showVolume, onKindChange, onVolumeChange }: {
  kind: 'candles' | 'line'; showVolume: boolean;
  onKindChange: (kind: 'candles' | 'line') => void; onVolumeChange: (visible: boolean) => void;
}) {
  return <Space size={16} wrap>
    <Checkbox checked={showVolume} onChange={e => onVolumeChange(e.target.checked)}>Volume</Checkbox>
    <Segmented<'candles' | 'line'> aria-label="Chart style" size="small" value={kind}
      options={[{ value: 'line', label: 'Line' }, { value: 'candles', label: 'Candles' }]} onChange={onKindChange}/>
  </Space>;
}
