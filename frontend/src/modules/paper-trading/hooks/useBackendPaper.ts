import {create} from 'zustand';
import {apiClient} from '../../../services/apiClient';
import type {SavedStrategy} from '../../strategies/hooks/useBackendStrategies';
export interface PaperSession {_id:string;strategy:SavedStrategy;ids?:string[];mode:'automatic'|'confirmation';cashPaise:number;initialPaise:number;entriesPaused:boolean;active:boolean;message?:string;checkedAt?:string}
export interface PaperPosition {_id:string;sessionId:string;instrumentId:string;symbol:string;quantity:number;entryPaise:number;stopPaise:number;targetPaise:number}
export interface PaperOrder {_id:string;sessionId:string;instrumentId:string;side:string;quantity:number;source:string;status:string;createdAt:string;reason:string;message?:string;fillPaise?:number;feePaise?:number}
export interface PaperSignal {_id:string;sessionId:string;instrumentId:string;side:string;barEnd:string;message?:string;orderId?:string}
interface Data {sessions:PaperSession[];positions:PaperPosition[];orders:PaperOrder[];signals:PaperSignal[];workerRunning:boolean;feed?:{state:string;message:string;freshIds:string[]};marketOpen?:boolean}
interface State {data?:Data;error?:string;refresh:()=>Promise<void>}
export const useBackendPaper=create<State>(set=>({refresh:async()=>{try{set({data:(await apiClient.get<Data>('/paper')).data,error:undefined});}catch(e){set({error:(e as Error).message});}}}));
