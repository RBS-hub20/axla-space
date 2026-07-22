import { openai } from "@ai-sdk/openai";
import { convertToModelMessages, streamText, type UIMessage } from "ai";
import { CHAT_DAILY_LIMIT, checkChatRateLimit, getClientIp } from "@/lib/rate-limit";
import { logUserMessage } from "@/lib/chat-log";
import { TAXLAYA_SYSTEM_PROMPT } from "@/lib/taxlaya-prompt";

function lastUserMessageText(messages: UIMessage[]): string {
  const lastUserMessage = [...messages].reverse().find((m) => m.role === "user");
  if (!lastUserMessage) return "";
  return lastUserMessage.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("");
}

export const runtime = "edge";

export async function POST(req: Request) {
  const ip = getClientIp(req);
  const { allowed } = await checkChatRateLimit(ip);

  if (!allowed) {
    return new Response(
      `${CHAT_DAILY_LIMIT}/${CHAT_DAILY_LIMIT} messages used today. Reset at 12mn or upgrade to Pro 🙏`,
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

  return result.toUIMessageStreamResponse({
    onError: (streamError) => {
      console.error("Chat stream error:", streamError);
      return "TaxLaya is resting 😴 Try again in 1 min";
    },
  });
}
