import { z } from "zod";

export const assetSchema = z.object({
  assetId: z.string().min(1),
  creatorId: z.string().min(1),
  title: z.string().min(1),
  plays: z.number().int().nonnegative(),
  processed: z.boolean()
}).strict();

export type Asset = z.infer<typeof assetSchema>;

export function buildDigest(assets: Asset[], creatorId: string) {
  const ready = assets.filter(asset => asset.creatorId === creatorId && asset.processed);
  if (ready.length === 0) return null;
  return {
    creatorId,
    totalPlays: ready.reduce((sum, asset) => sum + asset.plays, 0),
    titles: ready.map(asset => asset.title)
  };
}
