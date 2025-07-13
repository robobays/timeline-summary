import express from "express";
import { MongoClient } from "mongodb";
import fetch from "node-fetch";
import { Ollama } from "ollama";
import { Agent } from "undici";

const DB_ADDRESS = "mongodb://mongo:27017";
const DB_NAME = "timeline-summary";
const DB_COLLECTION = "matches";
const LLM_ADDRESS = "http://127.0.0.1:11434";
const LLM_MODEL = "robobays";
const SERVER_PORT = process.env.PORT || 3000;

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

async function summarizeMatch(data) {
  const { match, timeline } = data;
  console.log(`Summarizing match ${match} with ${timeline.length} timeline events.`);

  const response = await ollama.generate({
    model: LLM_MODEL,
    prompt: JSON.stringify(timeline),
    format: "json",
    stream: false,
    keep_alive: "24h",
  });

  return JSON.parse(response.response) || {};
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

async function findMatchToSummarize() {
  return await (await matches()).findOne({
    match: { $exists: true, $ne: null },
    summary: { $exists: false },
    timeline: { $exists: true, $ne: [] }
  });
}

async function readMatch(match) {
  return await (await matches()).findOne({ match });
}

async function listRecentSummaries() {
  return await (await matches()).find({ summary: { $exists: true } }).sort({ time: -1 });
}

async function updateMatch(match, data) {
  if (!match || (match !== data.match)) {
    console.error("Bad match request:", match, data);
  } else {
    await (await matches()).updateOne({ match }, { $set: data }, { upsert: true });
  }
}

async function processMatches() {
  try {
    const record = await findMatchToSummarize();

    if (record) {
      const summary = await summarizeMatch(record);

      await updateMatch(record.match, { ...record, summary });

      console.log("Saved summary:", record.match);
    }
  } catch (error) {
    console.error("Error processing matches:", error);
  }

  setTimeout(processMatches, 10000);
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

app.listen(SERVER_PORT, () => {
  console.log(`Server listening on port ${SERVER_PORT}`);

  loadModel();
  processMatches();
});
