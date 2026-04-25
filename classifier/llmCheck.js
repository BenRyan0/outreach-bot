const OpenAI = require("openai");
const { buildSystemPrompt, buildUserPrompt } = require("./prompt");

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function runLLMCheck(record, codeFindings) {
  const response = await client.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: buildSystemPrompt() },
      { role: "user", content: buildUserPrompt(record, codeFindings) },
    ],
    response_format: { type: "json_object" },
  });

  const text = response.choices[0].message.content.trim();
  return JSON.parse(text);
}

module.exports = { runLLMCheck };
