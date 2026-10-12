import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { extractFilesFromResponse } from "@/lib/llm";
import { getSessionData } from "@/lib/agent-engine";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { message, history = [], sessionId } = body;

    if (!message || typeof message !== "string") {
      return NextResponse.json({ error: "Message requis" }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === "TODO" || apiKey.trim() === "") {
      return NextResponse.json({
        text: "Bonjour ! Je suis l'assistant vocal Gemini Live. Veuillez configurer votre clé API pour démarrer la voix.",
        files: {},
      });
    }

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });

    const candidateModels = [
      "gemini-3-flash-preview",
      "gemini-3.1-flash-lite-preview",
      "gemini-flash-latest",
      "gemini-3.8-flash",
    ];

    const systemInstruction = `Tu es Gemini Live, l'assistant vocal conversationnel et agent de développement en direct pour OpenCode / CodeForge.
Règles strictes pour la conversation vocale :
1. Tes réponses doivent être naturelles, directes, concises et faciles à écouter (style conversation parlée, max 2 à 4 phrases pour les réponses orales).
2. Réponds en français fluide et chaleureux.
3. Si l'utilisateur te demande explicitement de coder ou modifier un fichier de son projet, tu peux fournir le code dans un bloc :
\`\`\`tsx filepath=src/App.tsx
...
\`\`\`
En voix, décris brièvement ce que tu viens de coder en une phrase.
4. Évite les puces longues ou les listes indigestes à l'oral. Sois spontané comme un véritable collègue ingénieur à côté de l'utilisateur.`;

    const formattedHistory = history.map((h: { role: string; content: string }) => ({
      role: h.role === "user" ? "user" : "model",
      parts: [{ text: h.content }],
    }));

    const contents = [
      ...formattedHistory,
      {
        role: "user",
        parts: [{ text: message }],
      },
    ];

    let responseText = "";

    for (const modelName of candidateModels) {
      try {
        const res = await ai.models.generateContent({
          model: modelName,
          contents,
          config: {
            systemInstruction,
            temperature: 0.7,
            maxOutputTokens: 800,
          },
        });

        if (res.text && res.text.trim()) {
          responseText = res.text.trim();
          break;
        }
      } catch (err) {
        console.warn(`Live model ${modelName} failed, trying next...`, err);
      }
    }

    if (!responseText) {
      responseText = "Désolé, je n'ai pas pu traiter votre demande vocale pour le moment.";
    }

    const extractedFiles = extractFilesFromResponse(responseText);

    // If session ID is provided and files were produced, save them into session
    if (sessionId && Object.keys(extractedFiles).length > 0) {
      const session = getSessionData(sessionId);
      if (session) {
        Object.assign(session.files, extractedFiles);
        session.preview_url = `/api/preview/${session.id}`;
      }
    }

    return NextResponse.json({
      text: responseText,
      files: extractedFiles,
    });
  } catch (error) {
    console.error("Live chat route error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur interne" },
      { status: 500 },
    );
  }
}
