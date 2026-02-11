import { z } from "zod";

export const trimWindowSchema = z
  .object({
    startSec: z.number().min(0),
    endSec: z.number().positive()
  })
  .refine((value) => value.endSec > value.startSec, {
    message: "trim.endSec must be greater than trim.startSec",
    path: ["endSec"]
  });

export const stopConditionsSchema = z
  .object({
    maxRepeats: z.number().int().positive().optional(),
    maxDurationSec: z.number().int().positive().optional(),
    endAtIsoUtc: z.string().datetime().optional(),
    strategy: z.literal("earliest-wins")
  })
  .refine(
    (value) => Boolean(value.maxRepeats || value.maxDurationSec || value.endAtIsoUtc),
    {
      message: "At least one stop condition is required"
    }
  );

export const newBroadcastSchema = z.object({
  title: z.string().min(3).max(120),
  description: z.string().max(5000).optional(),
  privacyStatus: z.enum(["private", "unlisted", "public"]),
  scheduledStartIsoUtc: z.string().datetime(),
  latencyPreference: z.literal("low")
});

export const sessionConfigSchema = z
  .object({
    profileId: z.string().min(1),
    videoPath: z.string().min(1),
    trim: trimWindowSchema,
    stop: stopConditionsSchema,
    broadcastMode: z.enum(["create-new", "reuse-existing"]),
    existingBroadcastId: z.string().optional(),
    newBroadcast: newBroadcastSchema.optional()
  })
  .superRefine((value, ctx) => {
    if (value.broadcastMode === "create-new" && !value.newBroadcast) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["newBroadcast"],
        message: "newBroadcast is required when broadcastMode is create-new"
      });
    }

    if (value.broadcastMode === "reuse-existing" && !value.existingBroadcastId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["existingBroadcastId"],
        message: "existingBroadcastId is required when broadcastMode is reuse-existing"
      });
    }
  });

export const ensureValidEndAt = (endAtIsoUtc: string, nowUtcMs: number): number => {
  const value = Date.parse(endAtIsoUtc);
  if (Number.isNaN(value)) {
    throw new Error("Invalid endAtIsoUtc");
  }
  return Math.floor((value - nowUtcMs) / 1000);
};
