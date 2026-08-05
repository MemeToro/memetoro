import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";

const envPath = fileURLToPath(new URL(".env", import.meta.url));
if (existsSync(envPath)) {
  loadEnvFile(envPath);
}

const PERPLEXITY_API_KEY = requireEnvironmentVariable("PERPLEXITY_API_KEY");
const XAI_API_KEY = requireEnvironmentVariable("XAI_API_KEY");
const PERPLEXITY_MODEL = process.env.PERPLEXITY_MODEL || "sonar";
const XAI_MODEL = process.env.XAI_MODEL || "grok-4.5";
const WINDOW_HOURS = 24;

const newsCandidateSchema = {
  type: "object",
  properties: {
    topic: { type: "string" },
    summary: { type: "string" },
    whyTrending: { type: "string" },
    memePotential: { type: "string" },
    riskNotes: { type: "string" },
    keyPoints: { type: "array", items: { type: "string" } },
    evidenceUrls: { type: "array", items: { type: "string" } },
  },
  required: [
    "topic",
    "summary",
    "whyTrending",
    "memePotential",
    "riskNotes",
    "keyPoints",
    "evidenceUrls",
  ],
  additionalProperties: false,
};

const xCandidateSchema = {
  type: "object",
  properties: {
    topic: { type: "string" },
    hashtagOrPhrase: { type: "string" },
    whySpiking: { type: "string" },
    memePotential: { type: "string" },
    riskNotes: { type: "string" },
    representativePosts: {
      type: "array",
      items: {
        type: "object",
        properties: {
          account: { type: "string" },
          summary: { type: "string" },
          url: { type: "string" },
        },
        required: ["account", "summary", "url"],
        additionalProperties: false,
      },
    },
  },
  required: [
    "topic",
    "hashtagOrPhrase",
    "whySpiking",
    "memePotential",
    "riskNotes",
    "representativePosts",
  ],
  additionalProperties: false,
};

const [newsResponse, xResponse] = await Promise.all([
  requestJson("Perplexity", "https://api.perplexity.ai/v1/sonar", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${PERPLEXITY_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: PERPLEXITY_MODEL,
      search_mode: "web",
      search_recency_filter: "day",
      temperature: 0.1,
      max_tokens: 2500,
      web_search_options: { search_context_size: "high" },
      messages: [
        {
          role: "user",
          content: [
            `Find up to five major worldwide news, culture, technology, and market topics from the last ${WINDOW_HOURS} hours.`,
            "Rank them by freshness and breadth of credible coverage, not by token-market potential.",
            "For each topic, explain what changed during the time window, why attention is increasing, and what visual or linguistic elements could support a meme.",
            "Include risks such as tragedy, misinformation, hate, manipulation, legal sensitivity, or weak evidence.",
            "Use only evidence URLs found during this search. Do not recommend or describe a token launch.",
          ].join(" "),
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          schema: {
            type: "object",
            properties: {
              candidates: {
                type: "array",
                items: newsCandidateSchema,
              },
            },
            required: ["candidates"],
            additionalProperties: false,
          },
        },
      },
    }),
    signal: AbortSignal.timeout(60_000),
  }),
  requestJson("xAI", "https://api.x.ai/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${XAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: XAI_MODEL,
      input: [
        {
          role: "user",
          content: [
            "Find up to five topics whose public conversation is accelerating on X now.",
            `Use activity from the last ${WINDOW_HOURS} hours, prioritizing the most recent few hours.`,
            "Rank by observable conversation momentum rather than news coverage or presumed token-market potential.",
            "For each topic, explain the spike, note possible meme elements, and identify safety, manipulation, misinformation, or sensitivity risks.",
            "Summarize representative posts without copying long passages and include only post URLs returned by X Search.",
            "Do not recommend or describe a token launch.",
          ].join(" "),
        },
      ],
      tools: [{ type: "x_search" }],
      text: {
        format: {
          type: "json_schema",
          name: "x_trend_candidates",
          strict: true,
          schema: {
            type: "object",
            properties: {
              candidates: {
                type: "array",
                items: xCandidateSchema,
              },
            },
            required: ["candidates"],
            additionalProperties: false,
          },
        },
      },
    }),
    signal: AbortSignal.timeout(60_000),
  }),
]);

const newsData = parseStructuredJson(
  newsResponse.choices?.[0]?.message?.content,
  "Perplexity structured response",
);
const xData = parseStructuredJson(extractXOutputText(xResponse), "xAI structured response");

const output = {
  schemaVersion: "0.1.0",
  kind: "memetoro.trend-signals",
  generatedAt: new Date().toISOString(),
  windowHours: WINDOW_HOURS,
  sources: {
    worldwideNews: {
      provider: "Perplexity",
      model: PERPLEXITY_MODEL,
      candidates: newsData.candidates,
      searchResults: (newsResponse.search_results || []).map((result) => ({
        title: result.title,
        url: result.url,
        date: result.date || null,
      })),
    },
    xTrends: {
      provider: "xAI",
      model: XAI_MODEL,
      candidates: xData.candidates,
    },
  },
};

console.log(JSON.stringify(output, null, 2));

function requireEnvironmentVariable(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    console.error(`Missing required environment variable: ${name}`);
    process.exit(1);
  }
  return value;
}

async function requestJson(provider, url, options) {
  let response;
  try {
    response = await fetch(url, options);
  } catch (error) {
    throw new Error(`${provider} request failed: ${error.message}`, { cause: error });
  }

  const body = await response.text();
  if (!response.ok) {
    throw new Error(
      `${provider} request failed with HTTP ${response.status}: ${body.slice(0, 500)}`,
    );
  }

  try {
    return JSON.parse(body);
  } catch (error) {
    throw new Error(`${provider} returned invalid JSON`, { cause: error });
  }
}

function extractXOutputText(response) {
  if (typeof response.output_text === "string") {
    return response.output_text;
  }

  return (response.output || [])
    .filter((item) => item.type === "message")
    .flatMap((item) => item.content || [])
    .filter((item) => item.type === "output_text")
    .map((item) => item.text)
    .join("\n");
}

function parseStructuredJson(value, label) {
  if (value && typeof value === "object") {
    return value;
  }
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} was empty`);
  }

  try {
    return JSON.parse(value);
  } catch (error) {
    throw new Error(`${label} was not valid JSON`, { cause: error });
  }
}
