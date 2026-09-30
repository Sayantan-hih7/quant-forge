import { useState } from 'react';
import { Button, Checkbox, Popover, Select, Space, Tag, Tooltip } from 'antd';
import { SlidersOutlined, PlusOutlined, DeleteOutlined, EditOutlined, EyeOutlined, EyeInvisibleOutlined, StarOutlined, StarFilled } from '@ant-design/icons';
import { IndicatorSettingsModal } from './IndicatorSettingsModal';
import { VolumeSettingsModal } from './VolumeSettingsModal';
import { indicatorName, indicatorColors, indicatorLabel, type ChartIndicator } from '../utils/chartIndicators';
import { indicatorChoices, createChartIndicator, type IndicatorChoice } from '../utils/indicatorDiscovery';
import { useChartPreferences, type ChartProfile } from '../store/chartPreferences';
import type { VolumeStyle } from '../utils/volumeSettings';
import type { StockTimeframe } from '../types';

export function ChartIndicators({ custom, onChange, strategy, showStrategy, onShowStrategy, timeframe, showVolume, volumeStyle, onVolumeChange }: {
  custom: ChartIndicator[]; onChange: (indicators: ChartIndicator[]) => void; strategy: ChartIndicator[];
  showStrategy: boolean; onShowStrategy: (value: boolean) => void; timeframe: StockTimeframe;
  showVolume:boolean; volumeStyle?:VolumeStyle; onVolumeChange:(change:Partial<ChartProfile>)=>void;
}) {
  const [choice, setChoice] = useState('ema'), [open,setOpen]=useState(false),[volumeOpen,setVolumeOpen]=useState(false);
  const [editing, setEditing] = useState<{indicator:ChartIndicator;adding:boolean}>();
  const favourites=useChartPreferences(s=>s.favourites),toggleFavourite=useChartPreferences(s=>s.toggleFavourite);
  const selected=indicatorChoices.find(c=>c.value===choice)!;
  const configure=(c:IndicatorChoice)=>{setOpen(false);if(c.value==='volume'){setVolumeOpen(true);return;}if(custom.length<12)setEditing({indicator:createChartIndicator(c,indicatorColors[custom.length%indicatorColors.length]),adding:true});};
  const average=custom.find(i=>i.kind==='volumeSma');
  const groups=['Quick setups','On the price chart','Below the price chart','Volume'];
  const content = <div className="chart-indicator-picker">
    <p className="muted">Explore with chart indicators. Saved trading rules stay unchanged.</p>
    {!!strategy.length && <><Checkbox checked={showStrategy} onChange={e => onShowStrategy(e.target.checked)}>Show strategy indicators</Checkbox><div className="chart-strategy-indicators">{strategy.map(i => <Tag key={i.id}>{indicatorLabel(i, timeframe)}</Tag>)}</div><p className="muted">Strategy indicators use their own timeframes and completed candles.</p></>}
    <strong>Your chart indicators</strong>
    <div className="chart-indicator-row"><span>Volume{average&&average.visible!==false?` ? SMA ${average.period}`:''}</span><Space size={0}>
      <Button type="text" size="small" aria-label={showVolume?'Hide Volume':'Show Volume'} icon={showVolume?<EyeOutlined/>:<EyeInvisibleOutlined/>} onClick={()=>onVolumeChange({showVolume:!showVolume})}/>
      <Button type="text" size="small" aria-label="Edit Volume" icon={<EditOutlined/>} onClick={()=>{setOpen(false);setVolumeOpen(true);}}/>
    </Space></div>
    {custom.filter(i=>i.kind!=='volumeSma').map(i => <div className="chart-indicator-row" key={i.id}><span style={{ color: i.color, opacity: i.visible === false ? 0.5 : 1 }}>{indicatorLabel(i, timeframe)}</span><Space size={0}>
      <Button type="text" size="small" aria-label={`${i.visible === false ? 'Show' : 'Hide'} ${indicatorName(i.kind)} ${i.period}`} icon={i.visible === false ? <EyeInvisibleOutlined/> : <EyeOutlined/>} onClick={() => onChange(custom.map(x => x.id === i.id ? { ...x, visible: x.visible === false } : x))}/>
      <Button type="text" size="small" aria-label={`Edit ${indicatorName(i.kind)} ${i.period}`} icon={<EditOutlined/>} onClick={() => {setOpen(false);setEditing({indicator:i,adding:false});}}/>
      <Button type="text" size="small" aria-label={`Remove ${i.kind.toUpperCase()} ${i.period}`} icon={<DeleteOutlined />} onClick={() => onChange(custom.filter(x => x.id !== i.id))} /></Space></div>)}
    {!!favourites.length && <div className="indicator-favourites"><strong>Favourites</strong><Space wrap>{indicatorChoices.filter(c=>favourites.includes(c.value)).map(c=><Button size="small" key={c.value} disabled={custom.length>=12&&c.value!=='volume'} onClick={()=>configure(c)}>{c.label}</Button>)}</Space></div>}
    <label htmlFor="chart-indicator-type">Add an indicator or quick setup</label>
    <div className="chart-add-indicator">
      <Select id="chart-indicator-type" aria-label="Indicator type" virtual={false} showSearch value={choice} onChange={setChoice} filterOption={(input,option)=>String(option&&'search' in option?option.search:'').toLowerCase().includes(input.toLowerCase().trim())} options={groups.map(group=>({label:group,options:indicatorChoices.filter(c=>c.group===group)}))}/>
      <Tooltip title={favourites.includes(choice)?'Remove favourite':'Save favourite'}><Button aria-label={favourites.includes(choice)?'Remove favourite':'Save favourite'} icon={favourites.includes(choice)?<StarFilled/>:<StarOutlined/>} onClick={()=>toggleFavourite(choice)}/></Tooltip>
      <Button aria-label="Configure indicator" icon={<PlusOutlined/>} disabled={custom.length>=12&&choice!=='volume'} onClick={()=>configure(selected)}>Configure</Button>
    </div>
    <p className="muted">Set periods and appearance before adding. Up to 12 custom indicators; favourites and layouts save on this device.</p>
  </div>;
  return <><Popover open={open} onOpenChange={setOpen} trigger="click" placement="bottomRight" title="Indicators" content={content}><Button aria-label="Indicators" size="small" icon={<SlidersOutlined />}>Indicators</Button></Popover>
    {editing && <IndicatorSettingsModal key={editing.indicator.id} indicator={editing.indicator} adding={editing.adding} onClose={() => setEditing(undefined)} onSave={value => onChange(editing.adding?[...custom,value]:custom.map(i => i.id === value.id ? value : i))}/>}
    {volumeOpen&&<VolumeSettingsModal show={showVolume} style={volumeStyle} average={average} canAddAverage={custom.length<12} onClose={()=>setVolumeOpen(false)} onSave={v=>onVolumeChange({showVolume:v.show,volumeStyle:v.style,custom:[...custom.filter(i=>i.kind!=='volumeSma'),...(v.average?[v.average]:[])]})}/>}
  </>;
}
