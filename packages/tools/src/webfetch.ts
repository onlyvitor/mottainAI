import { z } from "zod";
import { createTool, type ToolResult } from "./types";

const MAX_BYTES = 200_000;

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function htmlToMarkdown(html: string): string {
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(
      /<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi,
      (_m: string, level: string, content: string) =>
        `\n${"#".repeat(Number(level))} ${content.trim()}\n`
    )
    .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, "\n- $1")
    .replace(/<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, "[$2]($1)")
    .replace(/<(p|div|section|article|tr|ul|ol|table)[^>]*>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "");

  return decodeEntities(text)
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function htmlToText(html: string): string {
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ");

  return decodeEntities(text)
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export const webfetchTool = createTool({
  name: "webfetch",
  description:
    "Fetch content from a URL. Returns markdown (default), plain text, or raw HTML.",
  inputSchema: z.object({
    url: z.string().url().describe("The URL to fetch (http or https)"),
    format: z
      .enum(["markdown", "text", "html"])
      .optional()
      .default("markdown")
      .describe("Output format"),
    timeout: z
      .number()
      .optional()
      .default(30_000)
      .describe("Timeout in milliseconds"),
  }),
  async execute(input): Promise<ToolResult> {
    try {
      const response = await fetch(input.url, {
        signal: AbortSignal.timeout(input.timeout ?? 30_000),
        headers: { "User-Agent": "mottainai/0.1" },
        redirect: "follow",
      });

      const contentType = response.headers.get("content-type") ?? "";
      const body = await response.text();
      const truncated = body.length > MAX_BYTES;
      const content = truncated ? body.slice(0, MAX_BYTES) : body;

      if (!response.ok) {
        return {
          success: false,
          output: content.slice(0, 2_000),
          error: `HTTP ${response.status} ${response.statusText}`,
        };
      }

      const isHtml = contentType.includes("html") || /^\s*</.test(content);

      let output: string;
      if (input.format === "html") {
        output = content;
      } else if (isHtml) {
        output =
          input.format === "markdown"
            ? htmlToMarkdown(content)
            : htmlToText(content);
      } else {
        output = content;
      }

      if (truncated) {
        output += "\n\n[Content truncated at 200KB]";
      }

      return { success: true, output: output || "(empty response)" };
    } catch (error) {
      return {
        success: false,
        output: "",
        error: `Fetch failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
});
