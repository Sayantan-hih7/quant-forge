import type { ISeriesPrimitive, IPrimitivePaneView, IPrimitivePaneRenderer, SeriesAttachedParameter, Time } from 'lightweight-charts';
type Point={time:Time;upper:number;lower:number};
/** Cloud fill is a visual primitive; its points never enter the trading engine. */
export class IndicatorCloud implements ISeriesPrimitive<Time> {
  private attachedTo?:SeriesAttachedParameter<Time>;
  private groups:Point[][]=[];
  private colors=['#16a08522','#ef535022'];
  private readonly draw:IPrimitivePaneRenderer['draw']=target=>target.useMediaCoordinateSpace(({context})=>{
    const attached=this.attachedTo;if(!attached)return;
    for(const group of this.groups){let previous:{x:number;a:number;b:number;positive:boolean}|undefined;
      for(const p of group){const x=attached.chart.timeScale().timeToCoordinate(p.time),a=attached.series.priceToCoordinate(p.upper),b=attached.series.priceToCoordinate(p.lower);
        if(x===null||a===null||b===null){previous=undefined;continue;}
        if(previous){context.fillStyle=this.colors[previous.positive?0:1];context.beginPath();context.moveTo(previous.x,previous.a);context.lineTo(x,a);context.lineTo(x,b);context.lineTo(previous.x,previous.b);context.closePath();context.fill();}
        previous={x,a,b,positive:p.upper>=p.lower};
      }
    }
  });
  private readonly views:IPrimitivePaneView[]=[{zOrder:()=> 'bottom',renderer:()=>({draw:this.draw})}];
  attached(parameters:SeriesAttachedParameter<Time>){this.attachedTo=parameters;}
  detached(){this.attachedTo=undefined;}
  paneViews(){return this.views;}
  update(groups:Point[][],colors:string[]){this.groups=groups;this.colors=colors;this.attachedTo?.requestUpdate();}
}
