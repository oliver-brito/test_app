// zod schema for the /processThreeDSResponse route (PaRes from the Cardinal
// challenge iframe).

import { z } from "zod";

export const ProcessThreeDSResponseBody = z.object({
  paymentId: z.string().min(1),
  pa_response_information: z.unknown(),
  pa_response_URL: z.string().min(1),
});
