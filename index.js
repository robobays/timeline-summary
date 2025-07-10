import fs from "fs";
import express from "express";
import ollama from "ollama";

const FOLDER_TIMELINE = "timeline/";
const FOLDER_SUMMARY = "summary/";
const PORT = process.env.PORT || 3000;
const PROMPT = fs.readFileSync("prompt.txt", "utf-8");

if (!fs.existsSync(FOLDER_TIMELINE)) fs.mkdirSync(FOLDER_TIMELINE);
if (!fs.existsSync(FOLDER_SUMMARY)) fs.mkdirSync(FOLDER_SUMMARY);

const app = express();
app.use(express.json());

async function loadModel() {
  console.log("Loading model...");
  const result = await ollama.generate({ model: "llama3.1", keep_alive: "24h" });
  console.log("Model loaded:", result);
}

async function summarize(match, timeline) {
  console.log(`Summarizing match ${match} with ${timeline.length} timeline events.`);

  const response = await ollama.generate({
    model: "llama3.1",
    system: PROMPT,
    prompt: JSON.stringify(timeline),
    format: "json",
    stream: true,
    keep_alive: "24h",
  });

  const content = [];
  for await (const chunk of response) {
    console.log(":", JSON.stringify(chunk));
    if (chunk.response) {
      content.push(chunk.response);
    }
  }

  return content.join("");
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
