

export interface Message {
  id: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  timestamp: number;
  model?: string;
  cost?: number;
}

export interface Session {
  id: string;
  title: string;
  messages: Message[];
  totalCost: number;
  totalTokens: number;
  createdAt: number;
  updatedAt: number;
}

export function createSession(title?: string): Session {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    title: title || `Session ${new Date(now).toLocaleString()}`,
    messages: [],
    totalCost: 0,
    totalTokens: 0,
    createdAt: now,
    updatedAt: now,
  };
}

export function addMessage(
  session: Session,
  msg: Omit<Message, "id" | "timestamp">
): Message {
  const message: Message = {
    ...msg,
    id: crypto.randomUUID(),
    timestamp: Date.now(),
  };
  session.messages.push(message);
  session.updatedAt = Date.now();
  if (msg.cost) session.totalCost += msg.cost;
  return message;
}

export function getMessagesForLLM(
  session: Session
): Array<{ role: "user" | "assistant" | "system"; content: string }> {
  return session.messages
    .filter((m) => m.role !== "tool")
    .map((m) => ({
      role: m.role as "user" | "assistant" | "system",
      content: m.content,
    }));
}

export function compactSession(
  session: Session,
  maxMessages: number = 20
): void {
  if (session.messages.length <= maxMessages) return;

  const systemMsgs = session.messages.filter((m) => m.role === "system");
  const recentMsgs = session.messages.slice(-maxMessages);

  session.messages = [...systemMsgs, ...recentMsgs];
}
