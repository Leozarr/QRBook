import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";
import Groq from "groq-sdk";
import { GoogleGenAI, Modality } from "@google/genai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json({ limit: "50mb" }));

// AI Helpers
let _groq: Groq | null = null;
const getGroq = () => {
  if (!_groq) {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      throw new Error("GROQ_API_KEY is missing. Please set it in your environment variables.");
    }
    _groq = new Groq({ apiKey });
  }
  return _groq;
};

let _ai: any | null = null;
const getGemini = () => {
  if (!_ai) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is missing. Please set it in your environment variables.");
    }
    _ai = new GoogleGenAI({ apiKey });
  }
  return _ai;
};

// API Routes
app.post("/api/analyze-cover", async (req, res) => {
  try {
    const { imageData, provider } = req.body;
    if (!imageData) return res.status(400).json({ error: "Missing image data" });

    const base64Data = imageData.split(',')[1];
    const useGroqFirst = (provider === 'groq');

    const tryGroq = async () => {
      const groqClient = getGroq();
      const completion = await groqClient.chat.completions.create({
        messages: [
          {
            role: "user",
            content: [
              { 
                type: "text", 
                text: "Analise esta capa de livro e retorne as seguintes informações em JSON EXATO: { \"title\": string, \"author\": string, \"rating\": string, \"sequels\": string, \"reviews\": [ { \"user\": string, \"comment\": string, \"rating\": number } ], \"hasMovie\": boolean, \"movieInfo\": string }. Use o idioma do usuário (Português/Brasil). Importante: Retorne APENAS o JSON, sem markdown ou explicações." 
              },
              {
                type: "image_url",
                image_url: { url: `data:image/jpeg;base64,${base64Data}` },
              },
            ],
          },
        ],
        model: "llama-3.2-11b-vision-preview",
        response_format: { type: "json_object" }
      });
      return JSON.parse(completion.choices[0]?.message?.content || '{}');
    };

    const tryGemini = async () => {
      const geminiClient = getGemini();
      const response = await geminiClient.models.generateContent({
        model: "gemini-1.5-flash",
        contents: [
          {
            parts: [
              { text: "Analise esta capa de livro e retorne as seguintes informações em JSON: título, autor, nota (0-5 estrelas), sequências (se houver), uma lista de 3 críticas curtas de diferentes fontes, e se possui filme (com breve info se sim). Use o idioma do usuário (Português)." },
              { inlineData: { mimeType: "image/jpeg", data: base64Data } }
            ]
          }
        ]
      });
      return JSON.parse(response.text || '{}');
    };

    let finalData;
    if (useGroqFirst) {
      try {
        finalData = await tryGroq();
      } catch (e: any) {
        console.warn("Groq failed, falling back to Gemini", e.message);
        finalData = await tryGemini();
      }
    } else {
      try {
        finalData = await tryGemini();
      } catch (e: any) {
        console.warn("Gemini failed, falling back to Groq", e.message);
        finalData = await tryGroq();
      }
    }

    res.json(finalData);
  } catch (err: any) {
    console.error("Analysis Error:", err);
    res.status(500).json({ error: err.message || "Internal server error" });
  }
});

app.post("/api/scan-page", async (req, res) => {
  try {
    const { imageData, provider } = req.body;
    if (!imageData) return res.status(400).json({ error: "Missing image data" });

    const base64Data = imageData.split(',')[1];
    const useGroqFirst = (provider === 'groq');

    const tryGroq = async () => {
      const groqClient = getGroq();
      const completion = await groqClient.chat.completions.create({
        messages: [
          {
            role: "user",
            content: [
              { 
                type: "text", 
                text: "Extraia todo o texto visível nesta página do livro. Retorne apenas o texto puro, sem comentários ou formatação extra." 
              },
              {
                type: "image_url",
                image_url: { url: `data:image/jpeg;base64,${base64Data}` },
              },
            ],
          },
        ],
        model: "llama-3.2-11b-vision-preview",
      });
      return completion.choices[0]?.message?.content || "";
    };

    const tryGemini = async () => {
      const geminiClient = getGemini();
      const response = await geminiClient.models.generateContent({
        model: "gemini-1.5-flash",
        contents: [
          {
            parts: [
              { text: "Extraia todo o texto visível nesta página do livro. Retorne apenas o texto puro, sem comentários." },
              { inlineData: { mimeType: "image/jpeg", data: base64Data } }
            ]
          }
        ]
      });
      return response.text || "";
    };

    let finalText;
    if (useGroqFirst) {
      try {
        finalText = await tryGroq();
      } catch (e: any) {
        console.warn("Groq failed, falling back to Gemini", e.message);
        finalText = await tryGemini();
      }
    } else {
      try {
        finalText = await tryGemini();
      } catch (e: any) {
        console.warn("Gemini failed, falling back to Groq", e.message);
        finalText = await tryGroq();
      }
    }

    res.json({ text: finalText });
  } catch (err: any) {
    console.error("Scan Error:", err);
    res.status(500).json({ error: err.message || "Internal server error" });
  }
});

app.post("/api/chat", async (req, res) => {
  try {
    const { messages } = req.body;
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: "Messages are required and must be an array." });
    }

    const groqClient = getGroq();
    
    // Attempt to use a stable model, with a generic fallback
    const models = ["llama-3.3-70b-versatile", "llama-3.1-70b-versatile", "llama3-70b-8192"];
    let lastError = null;

    for (const model of models) {
      try {
        const completion = await groqClient.chat.completions.create({
          messages: [
            { 
              role: "system", 
              content: "Você é um assistente especialista em recomendações de livros e filmes para o app 'BookScan AI'. Seja amigável, carismático e use o idioma Português (Brasil). REGRAS: Use Markdown sempre, tópicos para listas, negrito para títulos e autores, e emojis para diversão. Estruture a resposta para ser organizada e agradável." 
            },
            ...messages
          ],
          model: model,
        });
        return res.json({ message: completion.choices[0]?.message?.content || "" });
      } catch (e: any) {
        lastError = e;
        console.warn(`Model ${model} failed, trying next...`, e.message);
        continue;
      }
    }

    throw lastError || new Error("All Groq models failed.");
  } catch (err: any) {
    console.error("Chat Error:", err);
    res.status(500).json({ error: err.message || "Internal server error" });
  }
});

app.get("/api/test-groq", async (req, res) => {
  try {
    const groqClient = getGroq();
    const completion = await groqClient.chat.completions.create({
      messages: [{ role: "user", content: "Responda apenas com a palavra 'OK' se estiver funcionando." }],
      model: "llama3-8b-8192", // Use a very common/cheap model for testing
    });
    res.json({ status: "success", message: completion.choices[0]?.message?.content });
  } catch (err: any) {
    console.error("Groq Test Error:", err.message);
    res.status(500).json({ status: "error", message: err.message });
  }
});

app.post("/api/generate-speech", async (req, res) => {
  try {
    const { text, language, voice } = req.body;
    if (!text) return res.status(400).json({ error: "Missing text" });

    const geminiClient = getGemini();
    const response = await geminiClient.models.generateContent({
      model: "gemini-2.0-flash-exp", 
      contents: [{ parts: [{ text: `Leia o seguinte texto em ${language}: ${text}` }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: voice || "Kore" },
          },
        },
      },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64Audio) throw new Error("Could not generate audio modality response.");
    
    res.json({ audio: base64Audio });
  } catch (err: any) {
    console.error("TTS Error:", err);
    res.status(500).json({ error: err.message });
  }
});

async function setupApp() {
  if (process.env.NODE_ENV !== "production" && process.env.VERCEL !== "1") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Always listen unless explicitly in a serverless environment like Vercel
  if (process.env.VERCEL !== "1") {
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  }
}

setupApp();

export default app;


