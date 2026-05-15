// zod schemas for the seats / map-availability routes.

import { z } from "zod";

export const RemoveSeatBody = z.object({
  admissionId: z.union([z.string().min(1), z.number()]),
});

export const MapAvailabilityBody = z.object({
  priceTypeId: z.string().min(1),
  numSeats: z.union([z.number().int().positive(), z.string().regex(/^\d+$/)]),
});
