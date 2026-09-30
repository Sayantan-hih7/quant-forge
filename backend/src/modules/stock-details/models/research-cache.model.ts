import { Schema,model } from 'mongoose';
import type { ResearchItem } from '../providers/research-feeds.js';
export interface ResearchCache { _id:string; items:ResearchItem[]; fetchedAt?:string; attemptedAt:string; error?:string }
const itemSchema=new Schema<ResearchItem>({id:String,symbol:String,company:String,date:String,title:String,description:String,kind:String,source:String,url:String,dateLabel:String,recordDate:String,side:String,quantity:Number,price:Number,securityId:String},{_id:false});
export const ResearchCacheModel=model<ResearchCache>('StockResearchCache',new Schema<ResearchCache>({_id:String,items:{type:[itemSchema],default:[]},fetchedAt:String,attemptedAt:String,error:String},{versionKey:false,strict:'throw'}),'stock_research_cache');
