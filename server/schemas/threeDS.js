// zod schema for the /processThreeDSResponse route (PaRes from the Cardinal
// challenge iframe).

import { z } from "zod";

export const ProcessThreeDSResponseBody = z.object({
  paymentId: z.string().min(1),
  paResponseInformation: z.unknown(),
  paResponseURL: z.string().min(1),
});
