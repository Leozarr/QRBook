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

// Initialize AI clients
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY || "" });
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

// API Routes
app.post("/api/analyze-cover", async (req, res) => {
  try {
    const { imageData, provider } = req.body;
    if (!imageData) return res.status(400).json({ error: "Missing image data" });

    const base64Data = imageData.split(',')[1];
    
    const useGroqFirst = (provider === 'groq');

    const tryGroq = async () => {
      const completion = await groq.chat.completions.create({
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
      const response = await ai.models.generateContent({
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
      } catch (e) {
        console.warn("Groq failed, falling back to Gemini", e);
        finalData = await tryGemini();
      }
    } else {
      try {
        finalData = await tryGemini();
      } catch (e) {
        console.warn("Gemini failed, falling back to Groq", e);
        finalData = await tryGroq();
      }
    }

    res.json(finalData);
  } catch (err: any) {
    console.error("Analysis Error:", err);
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/scan-page", async (req, res) => {
  try {
    const { imageData, provider } = req.body;
    if (!imageData) return res.status(400).json({ error: "Missing image data" });

    const base64Data = imageData.split(',')[1];
    const useGroqFirst = (provider === 'groq');

    const tryGroq = async () => {
      const completion = await groq.chat.completions.create({
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
      const response = await ai.models.generateContent({
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
      } catch (e) {
        console.warn("Groq failed, falling back to Gemini", e);
        finalText = await tryGemini();
      }
    } else {
      try {
        finalText = await tryGemini();
      } catch (e) {
        console.warn("Gemini failed, falling back to Groq", e);
        finalText = await tryGroq();
      }
    }

    res.json({ text: finalText });
  } catch (err: any) {
    console.error("Scan Error:", err);
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/chat", async (req, res) => {
  try {
    const { messages } = req.body;
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: "Messages are required and must be an array." });
    }

    const completion = await groq.chat.completions.create({
      messages: [
        { 
          role: "system", 
          content: "Você é um assistente especialista em recomendações de livros e filmes para o app 'BookScan AI'. Seja amigável, conciso e use o idioma Português (Brasil). Foque em dar sugestões baseadas nos gostos do usuário. IMPORTANTE: Use Markdown para estruturar suas respostas (use tópicos, negrito para títulos de livros/filmes, etc) para que a leitura seja agradável e organizada." 
        },
        ...messages
      ],
      model: "llama-3.3-70b-versatile",
    });

    res.json({ message: completion.choices[0]?.message?.content || "" });
  } catch (err: any) {
    console.error("Chat Error:", err);
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/test-groq", async (req, res) => {
  try {
    if (!process.env.GROQ_API_KEY) {
      return res.status(400).json({ status: "error", message: "Chave GROQ_API_KEY não configurada no ambiente." });
    }
    const completion = await groq.chat.completions.create({
      messages: [{ role: "user", content: "Responda apenas com a palavra 'OK' se estiver funcionando." }],
      model: "llama-3.2-11b-vision-preview",
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

    const response = await ai.models.generateContent({
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
  } else if (process.env.VERCEL !== "1") {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }
}

setupApp();

if (process.env.NODE_ENV !== "production" && process.env.VERCEL !== "1") {
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

export default app;


