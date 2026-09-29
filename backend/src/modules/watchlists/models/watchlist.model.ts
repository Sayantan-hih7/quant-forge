import { model, Schema } from 'mongoose';
export interface Watchlist { _id: string; name: string; ids: string[]; createdAt: string; updatedAt: string; archivedAt?: string }
export const WatchlistModel = model<Watchlist>('Watchlist', new Schema<Watchlist>({
  _id: String, name: { type: String, required: true }, ids: { type: [String], default: [] }, createdAt: String, updatedAt: String, archivedAt: String,
}, { strict: 'throw', versionKey: false }), 'watchlists');
