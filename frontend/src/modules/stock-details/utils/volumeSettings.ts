import { z } from 'zod';
export const volumeStyleSchema=z.object({
  upColor:z.string().regex(/^#[\da-f]{6}$/i),downColor:z.string().regex(/^#[\da-f]{6}$/i),opacity:z.number().min(10).max(100),
});
export type VolumeStyle=z.infer<typeof volumeStyleSchema>;
export const defaultVolumeStyle:VolumeStyle={upColor:'#168b72',downColor:'#e45566',opacity:45};
