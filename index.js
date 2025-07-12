import fs from "fs";
import express from "express";
import fetch from "node-fetch";
import { Ollama } from "ollama";
import { Agent } from "undici";

const FOLDER_TIMELINE = "timeline/";
const FOLDER_SUMMARY = "summary/";
const PORT = process.env.PORT || 3000;

if (!fs.existsSync(FOLDER_TIMELINE)) fs.mkdirSync(FOLDER_TIMELINE);
if (!fs.existsSync(FOLDER_SUMMARY)) fs.mkdirSync(FOLDER_SUMMARY);

const ollama = new Ollama({
  host: "http://127.0.0.1:11434",
  fetch: (url, options) => fetch(url, { ...(options || {}), dispatcher: new Agent({ headersTimeout: 1800000 }) }),
});

const app = express();
app.use(express.json());

async function loadModel() {
  console.log("Loading model...");
  const result = await ollama.generate({ model: "robobays", keep_alive: "24h" });
  console.log("Model loaded:", result);
}

async function summarize(match, timeline) {
  console.log(`Summarizing match ${match} with ${timeline.length} timeline events.`);

  const response = await ollama.generate({
    model: "robobays",
    prompt: JSON.stringify(timeline),
    format: "json",
    stream: false,
    keep_alive: "24h",
  });

  console.log("Response received:", response);

  return response.response || "{}";
}

async function runSummary() {
  const matches = fs.readdirSync(FOLDER_TIMELINE);

  for (const match of matches) {
    const request = JSON.parse(fs.readFileSync(FOLDER_TIMELINE + match, "utf-8"));

    const summary = await summarize(request.match, request.timeline);

    fs.writeFileSync(FOLDER_SUMMARY + match, summary, "utf-8");
    fs.rmSync(FOLDER_TIMELINE + match);

    console.log("Saved summary:", match);
  }

  setTimeout(runSummary, 10000);
}

app.get("/timeline-summary/:match", (request, response) => {
  const match = request.params?.match;
  const file = FOLDER_SUMMARY + match + ".json";

  if (match && fs.existsSync(file)) {
    response.json(JSON.parse(fs.readFileSync(file, "utf-8")));
  } else {
    response.json({ error: "No match found for: " + match });
  }
});

app.post("/timeline-summary/:match", async (request, response) => {
  const match = request.params?.match;
  const file = FOLDER_TIMELINE + match + ".json";

  fs.writeFileSync(file, JSON.stringify(request.body), "utf-8");

  response.json({ message: "OK" });
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);

  loadModel();
  runSummary();
});
