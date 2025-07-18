import express, { response } from "express";
import { MongoClient } from "mongodb";
import fetch from "node-fetch";
import fs from "fs";
import { GoogleGenAI } from "@google/genai";
import { Ollama } from "ollama";
import { Agent } from "undici";

const DB_ADDRESS = "mongodb://mongo:27017";
const DB_NAME = "timeline-summary";
const DB_COLLECTION = "matches";
const LLM_ADDRESS = "http://127.0.0.1:11434";
const LLM_MODEL = "robobays";
const SERVER_PORT = process.env.PORT || 3000;

const COOLDOWN_ON_ERROR = 3600000; // 1 hour
const COOLDOWN_ON_SUCCESS = 60000; // 1 minute

// Ollama
const ollama = new Ollama({
  host: LLM_ADDRESS,
  fetch: (url, options) => fetch(url, { ...(options || {}), dispatcher: new Agent({ headersTimeout: 1800000 }) }),
});

async function loadModel() {
  console.log("Loading model:", LLM_MODEL);
  const result = await ollama.generate({ model: LLM_MODEL, keep_alive: "24h" });
  console.log("Model loaded:", result);
}

async function summarizeMatchWithOllama(timeline) {
  const response = await ollama.generate({
    model: LLM_MODEL,
    prompt: JSON.stringify(timeline),
    format: "json",
    stream: false,
    keep_alive: "24h",
  });

  return extractJsonResponse(response.response);
}

// Gemma
const gemma = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY });
const gemmaSystemPrompt = extractFromText(fs.readFileSync("Modelfile", "utf8"), '"""', 3, '"""', 0);

async function summarizeMatchWithGemma(model, timeline) {
  const response = await gemma.models.generateContent({
    model,
    contents: [
      { role: "model", parts: [{ text: gemmaSystemPrompt }] },
      { role: "user", parts: [{ text: JSON.stringify(timeline) }] },
    ],
  });

  return extractJsonResponse(response.text);
}

function extractJsonResponse(text) {
  const json = extractFromText(text, "{", 0, "}", 1);

  if (json) {
    try {
      return JSON.parse(json);
    } catch (error) {
      console.error("Error parsing JSON:", error);

      return { error: error.message };
    }
  }

  return {};
}

function extractFromText(text, begin, bo, end, eo) {
  const beginIndex = text.indexOf(begin);
  const endIndex = text.lastIndexOf(end);

  if ((beginIndex >= 0) && (endIndex > beginIndex)) {
    return text.substring(beginIndex + bo, endIndex + eo);
  }
}

// MongoDB
let db = null;

async function matches() {
  if (!db) {
    const client = new MongoClient(DB_ADDRESS, { connectTimeoutMS: 0 });

    await client.connect();

    db = client.db(DB_NAME).collection(DB_COLLECTION);
  }

  return db;
}

async function findMatchToSummarize(model) {
  const modelKey = model.replaceAll(".", "-");

  return await (await matches()).find({
    match: { $exists: true, $ne: null },
    [modelKey]: { $exists: false },
    timeline: { $exists: true, $ne: [] }
  }).sort({ time: -1 }).limit(1).next();
}

async function readMatch(match) {
  return await (await matches()).findOne({ match });
}

async function listRecentSummaries() {
  return await (await matches()).find({ summary: { $exists: true } }).sort({ time: -1 }).limit(20).toArray();
}

async function updateMatch(match, data) {
  if (!match || (match !== data.match)) {
    console.error("Bad match request:", match, data);
  } else {
    const collection = await matches();
    const record = await collection.findOne({ match }) || {};

    await collection.updateOne({ match }, { $set: { ...record, ...data } }, { upsert: true });
  }
}

async function processMatches(model) {
  try {
    const record = await findMatchToSummarize(model);

    if (record) {
      const { match, timeline } = record;
      console.log(`[${model}] Summarizing match ${match} with ${timeline.length} timeline events.`);

      const time = Date.now();
      const modelKey = model.replaceAll(".", "-");
      const summary = (model === "llama3.1") ? await summarizeMatchWithOllama(timeline) : await summarizeMatchWithGemma(model, timeline);

      summary.model = model;
      summary.processingTime = Date.now() - time;

      await updateMatch(record.match, { ...record, summary, [modelKey]: summary });

      console.log(`[${model}] Saved summary for match ${match} in ${(summary.processingTime / 1000).toFixed(2)} seconds.`);
    }

    setTimeout(() => processMatches(model), COOLDOWN_ON_SUCCESS);
  } catch (error) {
    console.error(`[${model}] Error processing matches: ${error.message}`);

    setTimeout(() => processMatches(model), COOLDOWN_ON_ERROR);
  }
}

// Express
const app = express();
app.use(express.json());

app.get("/timeline-summary/recent", async (request, response) => {
  const list = await listRecentSummaries();

  if (list) {
    response.json(list);
  } else {
    response.json({ error: "No recent match summaries found." });
  }
});

app.get("/timeline-summary/:match", async (request, response) => {
  const match = request.params?.match;
  const record = await readMatch(match);

  if (record) {
    response.json(record);
  } else {
    response.json({ error: "No match found for: " + match });
  }
});

app.post("/timeline-summary/:match", async (request, response) => {
  await updateMatch(request.params?.match, request.body);

  response.json({ message: "OK" });
});

app.listen(SERVER_PORT, async () => {
  console.log(`Server listening on port ${SERVER_PORT}`);

  await loadModel();
  await matches();

  processMatches("llama3.1");
  processMatches("gemma-3-27b-it");
  processMatches("gemini-2.5-pro");
});
