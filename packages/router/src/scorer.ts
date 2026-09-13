import { z } from "zod";

export const ComplexityTier = z.enum([
  "SIMPLE",
  "MEDIUM",
  "COMPLEX",
  "REASONING",
]);
export type ComplexityTier = z.infer<typeof ComplexityTier>;

export interface ComplexityScore {
  tier: ComplexityTier;
  confidence: number;
  rawScore: number;
}

interface DimensionKeywords {
  positive: string[];
  negative: string[];
}

const DIMENSIONS: Record<string, DimensionKeywords> = {
  reasoningMarkers: {
    positive: [
      "prove",
      "theorem",
      "step by step",
      "derive",
      "proof",
      "mathematical",
      "induction",
      "contradiction",
    ],
    negative: [],
  },
  codePresence: {
    positive: [
      "function",
      "class",
      "import",
      "```",
      "def ",
      "const ",
      "let ",
      "async ",
      "await ",
      "return ",
      "export ",
      "interface ",
      "type ",
    ],
    negative: [],
  },
  multiStepPatterns: {
    positive: [
      "first",
      "then",
      "step 1",
      "step 2",
      "1.",
      "2.",
      "3.",
      "firstly",
      "secondly",
      "finally",
      "after that",
    ],
    negative: [],
  },
  technicalTerms: {
    positive: [
      "algorithm",
      "kubernetes",
      "distributed",
      "concurrent",
      "mutex",
      "semaphore",
      "recursion",
      "polymorphism",
      "architecture",
      "infrastructure",
    ],
    negative: [],
  },
  creativeMarkers: {
    positive: ["story", "poem", "brainstorm", "creative", "narrative"],
    negative: [],
  },
  simpleIndicators: {
    positive: [
      "what is",
      "hello",
      "hi there",
      "define",
      "who is",
      "when was",
      "where is",
    ],
    negative: [],
  },
  agenticTask: {
    positive: [
      "edit",
      "deploy",
      "fix",
      "debug",
      "refactor",
      "implement",
      "build",
      "create",
      "write",
    ],
    negative: [],
  },
  constraintCount: {
    positive: [
      "at most",
      "within",
      "exactly",
      "must be",
      "O(",
      "complexity",
      "constraint",
    ],
    negative: [],
  },
  imperativeVerbs: {
    positive: [
      "build",
      "create",
      "implement",
      "design",
      "write",
      "generate",
      "produce",
    ],
    negative: [],
  },
  outputFormat: {
    positive: ["json", "yaml", "csv", "table", "xml", "markdown"],
    negative: [],
  },
  referenceComplexity: {
    positive: [
      "the code above",
      "the API docs",
      "as mentioned",
      "refer to",
      "based on",
    ],
    negative: [],
  },
  domainSpecificity: {
    positive: [
      "quantum",
      "FPGA",
      "genomics",
      "cryptography",
      "neural network",
      "transformer",
    ],
    negative: [],
  },
};

const WEIGHTS: Record<string, number> = {
  reasoningMarkers: 0.18,
  codePresence: 0.15,
  multiStepPatterns: 0.12,
  technicalTerms: 0.10,
  tokenCount: 0.08,
  creativeMarkers: 0.05,
  questionComplexity: 0.05,
  agenticTask: 0.04,
  constraintCount: 0.04,
  imperativeVerbs: 0.03,
  outputFormat: 0.03,
  simpleIndicators: 0.02,
  referenceComplexity: 0.02,
  domainSpecificity: 0.02,
};

function scoreKeywords(text: string, dim: DimensionKeywords): number {
  let score = 0;
  for (const kw of dim.positive) {
    if (text.includes(kw)) score += 0.25;
  }
  return Math.min(score, 1.0);
}

function scoreTokenCount(wordCount: number): number {
  if (wordCount < 10) return -1.0;
  if (wordCount < 50) return -0.5;
  if (wordCount < 200) return 0.0;
  if (wordCount < 500) return 0.5;
  return 1.0;
}

function scoreQuestionComplexity(text: string): number {
  const marks = (text.match(/\?/g) || []).length;
  if (marks > 3) return 0.5;
  if (marks > 1) return 0.25;
  return 0;
}

function sigmoid(x: number, steepness: number = 12): number {
  return 1 / (1 + Math.exp(-steepness * x));
}

export function classifyComplexity(prompt: string): ComplexityScore {
  const lower = prompt.toLowerCase();
  const wordCount = prompt.split(/\s+/).length;

  const scores: Record<string, number> = {};

  for (const [dim, kws] of Object.entries(DIMENSIONS)) {
    scores[dim] = scoreKeywords(lower, kws);
  }

  scores.tokenCount = scoreTokenCount(wordCount);
  scores.questionComplexity = scoreQuestionComplexity(prompt);
  scores.outputFormat =
    /\b(json|yaml|csv|table|xml)\b/i.test(prompt) ? 0.5 : 0;
  scores.imperativeVerbs =
    /\b(build|create|implement|design|write)\b/i.test(prompt) ? 0.5 : 0;
  scores.constraintCount =
    /\b(at most|within|exactly|must be|O\()\b/i.test(prompt) ? 0.5 : 0;

  let weightedScore = 0;
  for (const [dim, weight] of Object.entries(WEIGHTS)) {
    weightedScore += (scores[dim] || 0) * weight;
  }

  const boundaries: Array<{ tier: ComplexityTier; threshold: number }> = [
    { tier: "SIMPLE", threshold: 0.0 },
    { tier: "MEDIUM", threshold: 0.3 },
    { tier: "COMPLEX", threshold: 0.5 },
    { tier: "REASONING", threshold: Infinity },
  ];

  let tier: ComplexityTier = "SIMPLE";
  let nearestBoundary = 0;
  for (const b of boundaries) {
    if (weightedScore >= b.threshold) {
      tier = b.tier;
      nearestBoundary = b.threshold;
    }
  }

  const distance = Math.abs(weightedScore - nearestBoundary);
  const confidence = sigmoid(distance);

  return {
    tier: confidence < 0.7 ? "MEDIUM" : tier,
    confidence,
    rawScore: weightedScore,
  };
}
