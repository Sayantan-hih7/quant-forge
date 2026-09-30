"""Causal OHLCV indicators. Chart shifts are not future inputs to rules."""
import math
import numpy as np
import pandas as pd
from .field_catalog import FIELDS

def validate_pivot_frame(field,frame,settings):
    if FIELDS.get(field,{}).get('indicator')!='pivots': return
    rank={'1m':1,'5m':5,'15m':15,'1h':60,'4h':240,'1d':375,'1w':2000,'1mo':9000}
    pivot=(settings or {}).get('pivotFrame','1mo')
    if rank.get(frame,0)>rank[pivot]: raise ValueError('Pivot timeframe must be at least the rule candle timeframe. Monthly qualification uses monthly pivots.')

def pivot_series(daily,bars,field,s):
    if daily.empty or bars.empty: return pd.Series(np.nan,index=bars.index)
    frame=s.get('pivotFrame','1mo');local=daily.index.tz_convert('Asia/Kolkata').tz_localize(None)
    keys=local.strftime('%Y-%m-%d') if frame=='1d' else local.to_period('W-SUN' if frame=='1w' else 'M').start_time.strftime('%Y-%m-%d')
    grouped=daily.assign(key=keys).groupby('key').agg(high=('high','max'),low=('low','min'),close=('close','last'))
    out=[];index={'pivot':0,'pivotR1':1,'pivotS1':2,'pivotR2':3,'pivotS2':4,'pivotR3':5,'pivotS3':6}[field]
    for at in bars.index:
        at=at.tz_convert('Asia/Kolkata').tz_localize(None);key=at.strftime('%Y-%m-%d') if frame=='1d' else at.to_period('W-SUN' if frame=='1w' else 'M').start_time.strftime('%Y-%m-%d')
        old=grouped.loc[grouped.index<key]
        if old.empty: out.append(np.nan);continue
        if frame!='1d':
            expected=(at.to_period('W-SUN' if frame=='1w' else 'M')-1).start_time.strftime('%Y-%m-%d')
            if old.index[-1]!=expected: out.append(np.nan);continue
        b=old.iloc[-1];p=(b.high+b.low+b.close)/3;r=b.high-b.low;kind=s.get('pivotType','traditional')
        values=[p,p+.382*r,p-.382*r,p+.618*r,p-.618*r,p+r,p-r] if kind=='fibonacci' else [p,b.close+1.1*r/12,b.close-1.1*r/12,b.close+1.1*r/6,b.close-1.1*r/6,b.close+1.1*r/4,b.close-1.1*r/4] if kind=='camarilla' else [p,2*p-b.low,2*p-b.high,p+r,p-r,2*p+b.high-2*b.low,2*p-2*b.high+b.low]
        out.append(values[index])
    return pd.Series(out,index=bars.index)

def source(df, name='close'):
    if name=='hl2': return (df.high+df.low)/2
    if name=='hlc3': return (df.high+df.low+df.close)/3
    if name=='ohlc4': return (df.open+df.high+df.low+df.close)/4
    return df[name]

def average(v,n,kind='sma',volume=None):
    if kind=='ema': return v.ewm(span=n,adjust=False,min_periods=n).mean()
    if kind=='dema':
        first=average(v,n,'ema')
        return 2*first-average(first,n,'ema')
    if kind=='wma': return v.rolling(n).apply(lambda w: np.dot(w,np.arange(1,n+1))/(n*(n+1)/2),raw=True)
    if kind=='vwma': return (v*volume).rolling(n).sum()/volume.rolling(n).sum().replace(0,np.nan)
    if kind=='hma': return average(2*average(v,max(1,n//2),'wma')-average(v,n,'wma'),max(1,int(math.sqrt(n))),'wma')
    return v.rolling(n).mean()

def extended_indicator(df,field,n,settings):
    from .rules import indicator, wilder, supertrend
    kind=FIELDS[field].get('indicator');s=settings or {};n=n or 14
    v=source(df,s.get('source','close'));out=None
    if kind in ('ema','sma','wma','vwma','hma','dema'): return average(v,n,kind,df.volume)
    if kind=='averagePrice': return source(df,s.get('source','ohlc4'))
    if kind=='connorsRsi':
        from .rules import rsi
        streak=0; streaks=[]
        for delta in df.close.diff():
            streak=0 if pd.isna(delta) or delta==0 else max(0,streak)+1 if delta>0 else min(0,streak)-1
            streaks.append(streak)
        lookback=s.get('rankPeriod',100)
        returns=df.close.pct_change(fill_method=None)*100
        rank=returns.rolling(lookback+1).apply(lambda w: 100*np.sum(w[:-1]<w[-1])/lookback,raw=True)
        return (rsi(df.close,n)+rsi(pd.Series(streaks,index=df.index,dtype=float),s.get('streakPeriod',2))+rank)/3
    if kind=='rsi': return indicator(df.assign(close=v),'rsi',n)
    if kind=='supertrend': return supertrend(df,n,s.get('multiplier',3))
    if kind in ('bollinger','bollingerBandwidth'):
        middle=average(v,n,s.get('maType','sma'),df.volume);sd=v.rolling(n).std(ddof=0 if s.get('deviation')=='population' else 1);width=s.get('multiplier',2)*sd
        return (2*width/middle.replace(0,np.nan)*100) if kind=='bollingerBandwidth' else middle+width if field=='bollingerUpper' else middle-width
    if kind=='macd':
        line=average(v,s.get('fastPeriod',12),'ema')-average(v,s.get('slowPeriod',26),'ema');signal=average(line,s.get('signalPeriod',9),'ema')
        return signal if field=='macdSignal' else line-signal if field=='macdHistogram' else line
    if kind in ('adx','diPlus','diMinus'):
        atr=indicator(df,'atr',n);up=df.high.diff().fillna(0);down=-df.low.diff().fillna(0)
        plus=100*wilder(up.where((up>down)&(up>0),0),n)/atr.replace(0,np.nan);minus=100*wilder(down.where((down>up)&(down>0),0),n)/atr.replace(0,np.nan)
        return plus if kind=='diPlus' else minus if kind=='diMinus' else wilder(100*(plus-minus).abs()/(plus+minus).replace(0,np.nan),s.get('adxSmoothing',n))
    if kind=='vwap':
        times=pd.Series(df.index.tz_convert('Asia/Kolkata'),index=df.index);anchor=s.get('anchor','session')
        keys=times.dt.strftime('%Y-%m-%d') if anchor=='session' else times.dt.strftime('%Y-%m') if anchor=='month' else (times-pd.to_timedelta(times.dt.weekday,unit='d')).dt.strftime('%Y-%m-%d')
        price=source(df,s.get('source','hlc3'));volume=df.volume
        if anchor=='custom':
            at=pd.Timestamp(s['anchorDate']+'T'+(s.get('anchorTime') or '00:00')+':00',tz='Asia/Kolkata')
            # A later prefix cannot stand in for the requested anchor history.
            if times.iloc[0].date()>at.date() or (s.get('anchorTime') and times.iloc[0]>at):
                return pd.Series(np.nan,index=df.index)
            mask=times>=at;volume=volume.where(mask);price=price.where(mask);keys=pd.Series('anchor',index=df.index)
        return (price*volume).groupby(keys).cumsum()/volume.groupby(keys).cumsum().replace(0,np.nan)
    if kind=='donchian': return df.high.rolling(n).max() if field=='donchianUpper' else df.low.rolling(n).min()
    if kind in ('keltner','atrBands'):
        mid=average(v,n,'ema') if kind=='keltner' else v;atr=indicator(df,'atr',s.get('atrPeriod',10) if kind=='keltner' else n);width=atr*s.get('multiplier',2)
        return mid+width if field.endswith('Upper') else mid-width
    if kind=='roc': return (v/v.shift(n).replace(0,np.nan)-1)*100
    if kind=='momentum': return v-v.shift(n)
    if kind=='cci':
        v=source(df,s.get('source','hlc3'));mean=v.rolling(n).mean();dev=v.rolling(n).apply(lambda w: np.mean(np.abs(w-np.mean(w))),raw=True)
        return ((v-mean)/(.015*dev.replace(0,np.nan))).where(dev!=0,0)
    if kind in ('stochastic','stochRsi','williamsR'):
        base=indicator(df.assign(close=v),'rsi',n) if kind=='stochRsi' else df.close;length=s.get('stochPeriod',14) if kind=='stochRsi' else n
        hi=(base if kind=='stochRsi' else df.high).rolling(length).max();lo=(base if kind=='stochRsi' else df.low).rolling(length).min();raw=100*(base-lo)/(hi-lo).replace(0,np.nan)
        if kind=='williamsR': return raw-100
        k=raw.rolling(s.get('smoothK',3)).mean();return k.rolling(s.get('dPeriod',3)).mean() if field.endswith('D') else k
    if kind=='mfi':
        typical=source(df,'hlc3');flow=typical*df.volume;delta=typical.diff();positive=flow.where(delta>0,0).where(delta.notna()).rolling(n).sum();negative=flow.where(delta<0,0).where(delta.notna()).rolling(n).sum()
        return (100-100/(1+positive/negative.replace(0,np.nan))).where(negative!=0,100).where((positive+negative)!=0)
    if kind=='obv':
        direction=np.sign(df.close.diff());direction.iloc[0]=1;return (direction*df.volume).cumsum()
    if kind=='cmf':
        flow=((2*df.close-df.high-df.low)/(df.high-df.low).replace(0,np.nan)).fillna(0)*df.volume
        return flow.rolling(n).sum()/df.volume.rolling(n).sum().replace(0,np.nan)
    if kind=='aroon': return (df.high if field=='aroonUp' else df.low).rolling(n+1).apply(lambda w: (n-np.argmax(w[::-1] if field=='aroonUp' else -w[::-1]))/n*100,raw=True)
    if kind=='choppiness':
        tr=pd.concat([df.high-df.low,(df.high-df.close.shift()).abs(),(df.low-df.close.shift()).abs()],axis=1).max(axis=1);range_=df.high.rolling(n).max()-df.low.rolling(n).min()
        return 100*np.log10(tr.rolling(n).sum()/range_.replace(0,np.nan))/math.log10(n)
    if kind=='ichimoku':
        def mid(length): return (df.high.rolling(length).max()+df.low.rolling(length).min())/2
        conversion=mid(s.get('conversionPeriod',9));base=mid(s.get('basePeriod',26));shift=s.get('displacement',26)
        return conversion if field=='ichimokuConversion' else base if field=='ichimokuBase' else ((conversion+base)/2).shift(shift) if field=='ichimokuA' else mid(s.get('spanPeriod',52)).shift(shift)
    if kind=='sar':
        out=pd.Series(np.nan,index=df.index)
        if len(df)<2: return out
        up=df.close.iloc[1]>=df.close.iloc[0];ep=df.high.iloc[1] if up else df.low.iloc[1];af=s.get('start',.02);sar=df.low.iloc[0] if up else df.high.iloc[0]
        for i in range(1,len(df)):
            b=df.iloc[i]
            if i>1:
                sar+=af*(ep-sar);sar=min(sar,df.low.iloc[i-1],df.low.iloc[i-2]) if up else max(sar,df.high.iloc[i-1],df.high.iloc[i-2])
            if (b.low<sar if up else b.high>sar): sar=ep;up=not up;ep=b.high if up else b.low;af=s.get('start',.02)
            elif (b.high>ep if up else b.low<ep): ep=b.high if up else b.low;af=min(s.get('maximum',.2),af+s.get('increment',.02))
            out.iloc[i]=sar
        return out
    if out is None: raise ValueError(f'Unsupported configured indicator: {field}')
    return out
