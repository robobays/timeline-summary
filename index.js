import fs from "fs";
import express from "express";
import ollama from "ollama";

const PORT = process.env.PORT || 3000;
const PROMPT = fs.readFileSync("prompt.txt", "utf-8");

const app = express();
app.use(express.json());

app.post("/timeline-summary", async (request, response) => {
  const start = Date.now();

  console.log("Request received");
  console.log("Prompt:", PROMPT);
  console.log("Timeline:", JSON.stringify(request.body));

  try {
    const timeline = JSON.stringify(request.body);
    const result = await ollama.chat({
      model: "llama3.1",
      messages: [
        { role: "system", content: PROMPT },
        { role: "user", content: timeline },
      ],
    });
    response.json({
      content: result.message.content,
      millis: Date.now() - start,
    });
    console.log("Request processed in", Date.now() - start, "ms");
  } catch (error) {
    console.log("Request failed in", Date.now() - start, "ms");
    console.error(error);
    response.status(500).json({ error: error.message || "Internal Server Error" });
  }
});


const server = app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});

// Set server timeout to 10 minutes (600000 ms)
server.setTimeout(600000);
