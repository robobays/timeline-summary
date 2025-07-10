import fs from "fs";
import express from "express";
import ollama from "ollama";

const PORT = process.env.PORT || 3000;
const PROMPT = fs.readFileSync("prompt.txt", "utf-8");

const app = express();
app.use(express.json());

async function summarize(match, timeline) {
  const response = await ollama.chat({
    model: "llama3.1",
    messages: [
      { role: "system", content: PROMPT },
      { role: "user", content: timeline },
    ],
  });
  fs.writeFileSync(match + ".json", JSON.stringify(response.message.content));
}

app.get("/timeline-summary/:match", (request, response) => {
  const match = request.params.match;
  const summary = fs.readFileSync(match + ".json", "utf-8");
  response.json({ summary: JSON.parse(summary) });
});

app.post("/timeline-summary", async (request, response) => {
  try {
    summarize(request.body.match, request.body.timeline);
    response.json({ message: "OK" });
  } catch (error) {
    console.error(error);
    response.status(500).json({ error: error.message || "Internal Server Error" });
  }
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
