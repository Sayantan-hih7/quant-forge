import {create} from 'zustand';
import {apiClient} from '../../../services/apiClient';
import type {TradingPlanDraft} from '../types/tradingPlan';
export interface SavedStrategy extends TradingPlanDraft {_id:string;revision:number;savedAt:string}
interface State {strategies:SavedStrategy[];error?:string;loading:boolean;refresh:()=>Promise<void>}
export const useBackendStrategies=create<State>(set=>({strategies:[],loading:true,refresh:async()=>{try{const {data}=await apiClient.get<SavedStrategy[]>('/strategies');set({strategies:data,error:undefined,loading:false});}catch(e){set({error:(e as Error).message,loading:false});}}}));
