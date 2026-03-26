import { z } from "zod";
import { router, adminProcedure } from "../_core/trpc";
import { storagePut } from "../storage";

export const uploadRouter = router({
  // Upload a file to S3 from base64 data
  uploadImage: adminProcedure
    .input(z.object({
      fileName: z.string().min(1),
      base64Data: z.string().min(1),
      contentType: z.string().default("image/jpeg"),
    }))
    .mutation(async ({ input }) => {
      const buffer = Buffer.from(input.base64Data, "base64");
      const randomSuffix = Math.random().toString(36).substring(2, 8);
      const key = `uploads/${input.fileName}-${randomSuffix}`;
      const result = await storagePut(key, buffer, input.contentType);
      return result;
    }),
});
