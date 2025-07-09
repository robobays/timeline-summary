import fs from "fs";
import express from "express";
import ollama from "ollama";

const PORT = process.env.PORT || 3000;
const PROMPT = fs.readFileSync("prompt.txt", "utf-8");

const app = express();
app.use(express.json());

app.post("/timeline-summary", async (request, response) => {
  try {
    const timeline = JSON.stringify(request.body);
    const result = await ollama.chat({
      model: "llama3.1",
      messages: [
        { role: "system", content: PROMPT },
        { role: "user", content: timeline },
      ],
    });
    response.json({ content: result.message.content });
  } catch (error) {
    console.error(error);
    response.status(500).json({ error: error.message || "Internal Server Error" });
  }
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
