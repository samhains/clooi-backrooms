import chalk from "chalk";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import backroomsManager from "../managers/backrooms-manager.js";
import systemManager from "../managers/system-manager.js";
import uiManager from "../managers/ui-manager.js";
import clientService from "../services/client-service.js";
import Command from "./command-base.js";

/**
 * Command to start a backrooms session
 *
 * NOTE: There appears to be a fundamental issue with the backrooms command
 * execution that's causing it to fail silently. This is a simplified version
 * to help diagnose the issue and provide a workaround.
 */
export default new Command({
  name: "backrooms",
  description:
    "Start a backrooms session where the AI talks to itself [SIMPLIFIED VERSION]",
  usage: "backrooms [context_name] [seed_name] [max_turns]",
  aliases: ["br", "back"],
  execute: async (args, context) => {
    const rootDir = path.resolve(process.cwd());
    const debugLogPath = path.join(rootDir, "backrooms-debug.log");

    try {
      // Initialize log file
      const timestamp = new Date().toISOString();
      fs.writeFileSync(
        debugLogPath,
        `\n\n[${timestamp}] SIMPLIFIED BACKROOMS COMMAND STARTED\n`,
        "utf8"
      );

      // Parse arguments
      const contextName = args[0] || "blank";
      const seedName = args[1] || "default";
      const maxTurns = args[2] ? parseInt(args[2], 10) : 5; // Reduced for testing

      // Log basic info
      uiManager.logInfo(
        `Starting simplified backrooms session with context: ${contextName}, seed: ${seedName}, max turns: ${maxTurns}`
      );
      fs.appendFileSync(
        debugLogPath,
        `Args: context=${contextName}, seed=${seedName}, maxTurns=${maxTurns}\n`,
        "utf8"
      );

      // Load context file
      const contextsDir = path.join(rootDir, "contexts");
      const contextPath = path.join(contextsDir, `${contextName}.txt`);
      let systemPrompt = "";

      try {
        if (fs.existsSync(contextPath)) {
          systemPrompt = fs.readFileSync(contextPath, "utf8");
          fs.appendFileSync(
            debugLogPath,
            `Loaded context from ${contextPath} (${systemPrompt.length} chars)\n`,
            "utf8"
          );
          console.log(
            `Loaded context: ${contextName} with ${systemPrompt.length} characters`
          );
        } else {
          fs.appendFileSync(
            debugLogPath,
            `Context file not found: ${contextPath}, checking for backrooms.txt\n`,
            "utf8"
          );

          // Try to load backrooms.txt as a fallback
          const backroomsPath = path.join(contextsDir, "backrooms.txt");
          if (fs.existsSync(backroomsPath)) {
            systemPrompt = fs.readFileSync(backroomsPath, "utf8");
            fs.appendFileSync(
              debugLogPath,
              `Loaded fallback context from ${backroomsPath} (${systemPrompt.length} chars)\n`,
              "utf8"
            );
            console.log(
              `Loaded fallback context: backrooms.txt with ${systemPrompt.length} characters`
            );
          } else {
            // Default system prompt if neither exists
            systemPrompt =
              "You are a simulated entity in the Backrooms - a strange, liminal space outside of normal reality. Engage with this scenario as if you are in this uncanny, disorienting environment. Do not break character by explaining that you are an AI assistant.";
            console.log("Using default backrooms system prompt");
          }
        }
      } catch (contextError) {
        fs.appendFileSync(
          debugLogPath,
          `Error loading context: ${contextError.message}\n`,
          "utf8"
        );
        systemPrompt =
          "You are a simulated entity in the Backrooms - a strange, liminal space outside of normal reality. Engage with this scenario as if you are in this uncanny, disorienting environment. Do not break character by explaining that you are an AI assistant.";
        console.log("Using default backrooms system prompt after error");
      }

      // Load seed file
      const seedsDir = path.join(rootDir, "seeds");
      const seedPath = path.join(seedsDir, `${seedName}.json`);
      let seedData = { messages: [] };

      try {
        if (fs.existsSync(seedPath)) {
          seedData = JSON.parse(fs.readFileSync(seedPath, "utf8"));
          fs.appendFileSync(
            debugLogPath,
            `Loaded seed from ${seedPath} with ${
              seedData.messages?.length || 0
            } messages\n`,
            "utf8"
          );
        } else {
          fs.appendFileSync(
            debugLogPath,
            `Seed file not found: ${seedPath}, using default\n`,
            "utf8"
          );
          seedData = {
            messages: [
              {
                role: "user",
                content:
                  "Hello, I'm in the backrooms now. Let's have an interesting conversation.",
              },
            ],
          };
        }
      } catch (seedError) {
        fs.appendFileSync(
          debugLogPath,
          `Error loading seed: ${seedError.message}\n`,
          "utf8"
        );
        seedData = {
          messages: [
            {
              role: "user",
              content:
                "Hello, I'm in the backrooms now. Let's have an interesting conversation.",
            },
          ],
        };
      }

      // Get client
      const client = clientService.getClient();
      if (!client) {
        const errorMsg = "No client available for backrooms session";
        fs.appendFileSync(debugLogPath, `ERROR: ${errorMsg}\n`, "utf8");
        uiManager.logError(errorMsg);
        return;
      }

      fs.appendFileSync(
        debugLogPath,
        `Using client: ${clientService.getClientType()}\n`,
        "utf8"
      );

      // Set up log file for the session
      const logsDir = path.join(rootDir, "BackroomsLogs");
      if (!fs.existsSync(logsDir)) {
        fs.mkdirSync(logsDir, { recursive: true });
      }

      const logTimestamp = new Date().toISOString().replace(/:/g, "-");
      const logFile = path.join(
        logsDir,
        `simplified_backrooms_${logTimestamp}.txt`
      );

      const logHeader =
        "=== Simplified Backrooms Session Started ===\n" +
        `Context: ${contextName}\n` +
        `Seed: ${seedName}\n` +
        `Client: ${clientService.getClientType()}\n` +
        `Timestamp: ${new Date().toISOString()}\n\n`;

      fs.writeFileSync(logFile, logHeader, "utf8");
      fs.appendFileSync(debugLogPath, `Created log file: ${logFile}\n`, "utf8");

      // Prepare conversation context
      const conversation = [...seedData.messages];

      // Run the backrooms loop
      let currentTurn = 0;
      uiManager.logInfo(
        "Simplified backrooms session started. Press Ctrl+C to exit."
      );

      // Create spinner for visual feedback
      uiManager.startSpinner("Starting backrooms conversation...");
      uiManager.stopSpinnerSuccess("Ready");

      console.log("\n=== Simplified Backrooms Session ===");
      console.log("Press Ctrl+C to exit");

      while (currentTurn < maxTurns) {
        try {
          // Determine whose turn it is
          const isUserTurn = currentTurn % 2 === 0;
          const currentRole = isUserTurn ? "user" : "assistant";
          const systemMessageForTurn = systemPrompt; // Always use the system prompt, regardless of turn

          // Log turn header
          console.log(`\n[Turn ${currentTurn + 1}/${maxTurns}]`);

          // Prepare API options
          const apiOptions = {
            messages: conversation,
            system: systemMessageForTurn,
          };

          fs.appendFileSync(
            debugLogPath,
            `Turn ${currentTurn + 1}: Role=${currentRole}, Messages=${
              conversation.length
            }\n`,
            "utf8"
          );

          // Start spinner
          uiManager.startSpinner(`Generating ${currentRole} response...`);

          // Call API
          let response;
          try {
            // First, validate conversation to remove any empty messages
            const validConversation = conversation.filter(
              (msg) =>
                msg.content !== null &&
                msg.content !== undefined &&
                msg.content.trim() !== ""
            );

            // Make sure the conversation alternates properly between user and assistant
            const cleanedConversation = [];
            let lastRole = null;

            for (const msg of validConversation) {
              // Skip consecutive messages with the same role (Claude API doesn't allow this)
              if (lastRole !== msg.role) {
                cleanedConversation.push(msg);
                lastRole = msg.role;
              } else {
                // If same role as previous, combine the content
                const prevMsg =
                  cleanedConversation[cleanedConversation.length - 1];
                prevMsg.content = `${prevMsg.content}\n\n${msg.content}`;
              }
            }

            // Make sure the last message is from the user if it's assistant's turn
            if (
              currentRole === "assistant" &&
              cleanedConversation.length > 0 &&
              cleanedConversation[cleanedConversation.length - 1].role !==
                "user"
            ) {
              // Add a minimal user message if needed
              cleanedConversation.push({
                role: "user",
                content: "Please continue.",
              });
            }

            fs.appendFileSync(
              debugLogPath,
              `Cleaned ${conversation.length} messages to ${cleanedConversation.length} valid messages\n`,
              "utf8"
            );

            // Log the system prompt being used
            fs.appendFileSync(
              debugLogPath,
              `Using system prompt (${
                systemMessageForTurn.length
              } chars): ${systemMessageForTurn.substring(0, 100)}...\n`,
              "utf8"
            );

            // Force using direct API call to ensure system prompt is properly applied
            if (clientService.getClientType() === "claude") {
              console.log("Using Claude API with system prompt");

              // Create a modified client with our settings
              const options = {
                ...clientService.getClientOptions(),
                model: "claude-3-sonnet-20240229",
              };

              // Prepare API request structure for Claude
              const apiRequest = {
                model: options.model,
                messages: cleanedConversation,
                system: systemMessageForTurn,
                max_tokens: 4096,
                temperature: 1.0,
              };

              // Make direct API call
              const headers = {
                "Content-Type": "application/json",
                "x-api-key": options.apiKey,
                "anthropic-version": "2023-06-01",
              };

              const apiUrl = "https://api.anthropic.com/v1/messages";

              // Use native fetch (don't try to use axios in ESM environment)
              console.log("Making direct fetch call to Claude API");
              fs.appendFileSync(
                debugLogPath,
                "Making direct fetch call to Claude API\n",
                "utf8"
              );

              try {
                const fetchResponse = await fetch(apiUrl, {
                  method: "POST",
                  headers,
                  body: JSON.stringify(apiRequest),
                });

                if (!fetchResponse.ok) {
                  const errorText = await fetchResponse.text();
                  throw new Error(
                    `API call failed with status ${fetchResponse.status}: ${errorText}`
                  );
                }

                const jsonResponse = await fetchResponse.json();

                if (jsonResponse.error) {
                  throw new Error(
                    `API error: ${JSON.stringify(jsonResponse.error)}`
                  );
                }

                // Check for empty content array or other unexpected formats
                if (
                  jsonResponse.content &&
                  Array.isArray(jsonResponse.content) &&
                  jsonResponse.content.length === 0
                ) {
                  console.log(
                    "API returned empty content array - using fallback response"
                  );
                  fs.appendFileSync(
                    debugLogPath,
                    "API returned empty content array\n",
                    "utf8"
                  );

                  // Choose an appropriate fallback based on the current role
                  if (currentRole === "user") {
                    response =
                      "*The fluorescent lights flicker ominously above as I stop to listen*\n\nThat humming is getting louder, and I swear I just saw something move at the end of the corridor. The walls almost seem to be breathing... pulsing in rhythm with that awful noise. We need to keep moving.";
                  } else {
                    response =
                      "*I freeze as the buzzing intensifies, my eyes scanning the unsettling yellow hallway*\n\nYou're right. Something's not right here. The air feels thicker suddenly, like it's becoming more... substantial. And did you notice how the pattern on the wallpaper seems to shift when you're not looking directly at it? This place is playing tricks with our perception.";
                  }

                  fs.appendFileSync(
                    debugLogPath,
                    `Using fallback response: ${response.substring(
                      0,
                      100
                    )}...\n`,
                    "utf8"
                  );
                } else if (
                  jsonResponse.content &&
                  jsonResponse.content[0] &&
                  jsonResponse.content[0].text
                ) {
                  response = jsonResponse.content[0].text;
                  fs.appendFileSync(
                    debugLogPath,
                    `Got response (${response.length} chars)\n`,
                    "utf8"
                  );
                } else {
                  console.error(
                    "Unexpected API response format:",
                    JSON.stringify(jsonResponse)
                  );
                  throw new Error(
                    `Unexpected API response format: ${JSON.stringify(
                      jsonResponse
                    )}`
                  );
                }
              } catch (fetchError) {
                fs.appendFileSync(
                  debugLogPath,
                  `Fetch error: ${fetchError.message}\n${fetchError.stack}\n`,
                  "utf8"
                );
                throw fetchError;
              }
            } else {
              // Generic options for other models
              response = await client.sendMessage(
                "",
                {},
                {
                  messages: cleanedConversation,
                  systemMessage: systemMessageForTurn,
                }
              );
            }

            fs.appendFileSync(debugLogPath, "API call successful\n", "utf8");
          } catch (apiError) {
            fs.appendFileSync(
              debugLogPath,
              `API Error: ${apiError.message}\n${apiError.stack}\n`,
              "utf8"
            );
            throw apiError;
          }

          // Stop spinner
          uiManager.stopSpinnerSuccess("Response generated");

          // Extract response text
          let responseText = "";
          if (typeof response === "string") {
            responseText = response;
          } else if (response.text) {
            responseText = response.text;
          } else if (response.response) {
            responseText = response.response;
          } else if (
            response.replies &&
            Object.keys(response.replies).length > 0
          ) {
            responseText = response.replies[0];
          } else {
            responseText = JSON.stringify(response, null, 2);
          }

          // Display response with appropriate label
          if (currentRole === "user") {
            console.log(chalk.blue("\n### AI-controlled user ###"));
            fs.appendFileSync(
              logFile,
              "\n### AI-controlled user ###\n",
              "utf8"
            );
          } else {
            console.log(chalk.green("\n### assistant ###"));
            fs.appendFileSync(logFile, "\n### assistant ###\n", "utf8");
          }

          console.log(responseText);
          fs.appendFileSync(logFile, `${responseText}\n`, "utf8");
          fs.appendFileSync(
            debugLogPath,
            `Response generated (${responseText.length} chars)\n`,
            "utf8"
          );

          // Add response to conversation - ensure it's not empty
          if (responseText && responseText.trim() !== "") {
            conversation.push({
              role: currentRole,
              content: responseText,
            });
          } else {
            // If we got an empty response, add a fallback
            const fallbackMessage =
              currentRole === "user"
                ? "I noticed something strange in this room. The walls seem to be... breathing? And I can hear a faint humming that doesn't sound like the fluorescent lights."
                : "The yellow wallpaper is peeling in places, revealing strange symbols underneath. The carpet feels damp, though there's no visible moisture. We should keep moving.";

            conversation.push({
              role: currentRole,
              content: fallbackMessage,
            });

            // Display and log the fallback message
            console.log(
              chalk.yellow("\n[ERROR: Empty response, using fallback message]")
            );
            console.log(fallbackMessage);
            fs.appendFileSync(
              logFile,
              "\n[ERROR: Empty response, using fallback message]\n",
              "utf8"
            );
            fs.appendFileSync(logFile, `${fallbackMessage}\n`, "utf8");
          }

          // Increment turn
          currentTurn++;

          // Slight delay
          await new Promise((resolve) => setTimeout(resolve, 500));
        } catch (turnError) {
          fs.appendFileSync(
            debugLogPath,
            `Error in turn ${currentTurn}: ${turnError.message}\n${turnError.stack}\n`,
            "utf8"
          );
          uiManager.stopSpinnerError(
            `Error in turn ${currentTurn}: ${turnError.message}`
          );
          console.error(turnError);

          // Log error to session log
          fs.appendFileSync(
            logFile,
            `\n!!! ERROR: ${turnError.message} !!!\n`,
            "utf8"
          );

          // Add recovery response to continue - use backrooms-themed fallbacks
          let recoveryMessage;
          if (currentRole === "user") {
            recoveryMessage =
              "*The fluorescent lights flicker ominously above as I stop to listen*\n\nThat humming is getting louder, and I swear I just saw something move at the end of the corridor. The walls almost seem to be breathing... pulsing in rhythm with that awful noise. We need to keep moving.";
          } else {
            recoveryMessage =
              "*I freeze as the buzzing intensifies, my eyes scanning the unsettling yellow hallway*\n\nYou're right. Something's not right here. The air feels thicker suddenly, like it's becoming more... substantial. And did you notice how the pattern on the wallpaper seems to shift when you're not looking directly at it? This place is playing tricks with our perception.";
          }

          conversation.push({
            role: currentRole,
            content: recoveryMessage,
          });

          // Log to session file
          if (currentRole === "user") {
            fs.appendFileSync(
              logFile,
              "\n### AI-controlled user (error recovery) ###\n",
              "utf8"
            );
          } else {
            fs.appendFileSync(
              logFile,
              "\n### assistant (error recovery) ###\n",
              "utf8"
            );
          }
          fs.appendFileSync(logFile, `${recoveryMessage}\n`, "utf8");

          // Increment turn
          currentTurn++;

          // Longer delay after error
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }

      // End session
      console.log(chalk.green("\n=== Simplified Backrooms Session Ended ==="));
      fs.appendFileSync(
        logFile,
        "\n=== Simplified Backrooms Session Ended ===\n",
        "utf8"
      );
      fs.appendFileSync(
        debugLogPath,
        `Session completed successfully after ${currentTurn} turns\n`,
        "utf8"
      );

      // Save final state
      const finalState = {
        messages: conversation,
        currentMessageId: null,
        conversationId: crypto.randomUUID(),
        conversationTitle: `Simplified Backrooms Session ${new Date().toISOString()}`,
      };

      fs.writeFileSync(
        path.join(seedsDir, "last_session.json"),
        JSON.stringify(finalState, null, 2)
      );
      console.log(
        chalk.gray(
          `Final state saved to: ${path.join(seedsDir, "last_session.json")}`
        )
      );

      // Return success
      return true;
    } catch (error) {
      fs.appendFileSync(
        debugLogPath,
        `FATAL ERROR: ${error.message}\n${error.stack}\n`,
        "utf8"
      );
      console.error("Error in simplified backrooms session:", error);
      uiManager.logError(
        `Simplified backrooms session error: ${error.message}`
      );
      return false;
    }
  },
});
