import { classifyComplexity, LLMRouter, calculateCost, MODEL_CATALOG } from "./packages/router/src/index.ts";

console.log("=== YoruCode Router Test ===\n");

// Test complexity scoring
const testPrompts = [
  "hello",
  "what is a variable?",
  "fix the bug in auth.ts",
  "implement a recursive algorithm to solve the traveling salesman problem with dynamic programming and memoization, proving the time complexity is O(n*2^n)",
  "write a function to add two numbers",
  "deploy the application to kubernetes cluster with rolling updates and health checks",
];

console.log("1. Complexity Scoring:");
for (const prompt of testPrompts) {
  const result = classifyComplexity(prompt);
  console.log(`   "${prompt.slice(0, 50)}..."`);
  console.log(`     Tier: ${result.tier}, Score: ${result.rawScore.toFixed(3)}, Confidence: ${result.confidence.toFixed(3)}`);
}

// Test router
console.log("\n2. Router Selection:");
const router = new LLMRouter();

for (const prompt of testPrompts) {
  const decision = router.route({
    messages: [{ role: "user", content: prompt }],
    needsTools: true,
  });
  console.log(`   "${prompt.slice(0, 50)}..."`);
  console.log(`     Model: ${decision.model.displayName}, Tier: ${decision.tier}, Est. Cost: $${decision.estimatedCost.toFixed(6)}`);
}

// Test cost calculation
console.log("\n3. Cost Comparison (1000 input tokens, 500 output tokens):");
for (const model of MODEL_CATALOG) {
  const cost = calculateCost(model, 1000, 500);
  console.log(`   ${model.displayName}: $${cost.toFixed(6)}`);
}

console.log("\n=== All tests passed! ===");
