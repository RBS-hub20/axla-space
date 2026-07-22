import "server-only";
import { generateObject } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import { logError } from "@/lib/log-error";

const ReceiptSchema = z.object({
  vendor: z.string().nullable().describe("The store/business name on the receipt, or null if unreadable"),
  amount: z.number().nullable().describe("The total amount paid, as a plain number with no currency symbol"),
  date: z.string().nullable().describe("The receipt date in YYYY-MM-DD format, or null if not visible"),
  category: z
    .enum(["deductible", "non_deductible", "uncategorized"])
    .describe(
      "'deductible' for ordinary business expenses (supplies, equipment, transport, meals with clients, software, rent), 'non_deductible' for clearly personal purchases, 'uncategorized' if unclear",
    ),
});

export type ReceiptOcrResult = z.infer<typeof ReceiptSchema>;

const FALLBACK_RESULT: ReceiptOcrResult = {
  vendor: null,
  amount: null,
  date: null,
  category: "uncategorized",
};

/**
 * Extracts vendor/amount/date/category from a receipt image using OpenAI's
 * vision-capable gpt-4o-mini. Fails to a safe "uncategorized, unknown"
 * result rather than throwing — a failed OCR pass shouldn't block the
 * upload itself, since the user can always edit the fields manually later.
 */
export async function extractReceiptData(imageUrl: string): Promise<ReceiptOcrResult> {
  if (!process.env.OPENAI_API_KEY) {
    return FALLBACK_RESULT;
  }

  try {
    const { object } = await generateObject({
      model: openai("gpt-4o-mini"),
      schema: ReceiptSchema,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Extract the vendor name, total amount, date, and expense category from this Philippine receipt/invoice image. This is for a freelancer's BIR tax records.",
            },
            { type: "image", image: imageUrl },
          ],
        },
      ],
    });
    return object;
  } catch (err) {
    logError("extractReceiptData: OpenAI vision call failed", err);
    return FALLBACK_RESULT;
  }
}
