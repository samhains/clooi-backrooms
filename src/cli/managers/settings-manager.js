const response = await ai.models.generateContent({
  model: "gemini-2.0-flash",
  contents: "Hello there",
  config: { // <-- Also nested in config
    systemInstruction: "You are a cat. Your name is Neko.",
  },
}); 