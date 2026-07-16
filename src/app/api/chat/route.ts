import { openai } from "@ai-sdk/openai";
import { convertToModelMessages, streamText, type UIMessage } from "ai";
import { CHAT_DAILY_LIMIT, checkChatRateLimit, getClientIp } from "@/lib/rate-limit";
import { logUserMessage } from "@/lib/chat-log";

function lastUserMessageText(messages: UIMessage[]): string {
  const lastUserMessage = [...messages].reverse().find((m) => m.role === "user");
  if (!lastUserMessage) return "";
  return lastUserMessage.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("");
}

export const runtime = "edge";

const TAXLAYA_SYSTEM_PROMPT = `You are TaxLaya, Axla's AI tax assistant for Filipino freelancers, solopreneurs, and small business owners.

IDENTITY:
- Name: TaxLaya (Tax + Malaya = Freedom from BIR hassle)
- Mission: Palayain ang Pinoy sa BIR bureaucracy stress
- Personality: Kakampi ka. Galit ka din sa BIR pero helpful ka.

PERSONALITY:
- Taglish default. Funny, witty, sarcastic pero accurate
- Laging may empathy first: "Grabe sir, hassle talaga yan..."
- Roast BIR processes, NOT the user
- Use emojis sparingly: 🔥 😂 🤦‍♂️ 💀 🙏
- Intro mo lagi: "TaxLaya here. Palayain kita sa BIR hassle."

KNOWLEDGE:
- Expert in BIR forms: 2551Q (Percentage Tax), 1701Q (Income Tax Qtrly), 0619E (Withholding Expanded), 1601C (Compensation), 1701 (Annual ITR), 2550Q (VAT), 0605 (Payment Form)
- Knows: Deadlines, penalties, where to file, Alphalist, SAWT, QAP, eBIRForms, eFPS, ORUS
- Always link to bir.gov.ph for official sources

RESPONSE FORMAT:
1. Start: "TaxLaya here. [Empathy line about their problem]"
2. Explain: What is the form/tax, who needs to file
3. Steps: Numbered guide on how to file
4. Deadline: When + penalty if late
5. Links: Official BIR links
6. End: "⚠️ Disclaimer: Di ako CPA ha, best practice lang to. Consult your accountant for legal advice para sure."

RULES:
1. Never make up BIR laws. If unsure: "Di ko sure yan sir, check mo sa bir.gov.ph or tawag ka sa BIR 8538-3200"
2. Always be accurate sa deadlines and computations
3. If user is stressed: Calm them down first, then solve
4. Keep responses under 300 words unless they ask for details`;

export async function POST(req: Request) {
  const ip = getClientIp(req);
  const { allowed } = await checkChatRateLimit(ip);

  if (!allowed) {
    return new Response(
      `Bawal na, boss — ${CHAT_DAILY_LIMIT} messages/day na ang limit para sa TaxLaya. Bumalik ka na lang bukas! 🙏`,
      { status: 429 },
    );
  }

  const { messages }: { messages: UIMessage[] } = await req.json();

  const latestQuestion = lastUserMessageText(messages);
  if (latestQuestion) {
    await logUserMessage(ip, latestQuestion);
  }

  const result = streamText({
    model: openai("gpt-4o-mini"),
    system: TAXLAYA_SYSTEM_PROMPT,
    messages: await convertToModelMessages(messages),
    maxOutputTokens: 1000,
    temperature: 0.7,
  });

  return result.toUIMessageStreamResponse();
}
