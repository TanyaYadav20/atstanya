import "dotenv/config";

import { GoogleGenerativeAI } from "@google/generative-ai";
import { z } from "zod";

import { SYSTEM_PROMPT } from "../prompts/systemPrompt";
import { buildUserPrompt } from "../prompts/userPrompt";

// ============================================================
// GEMINI CLIENT
// ============================================================

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  throw new Error("GEMINI_API_KEY is not configured");
}

const genAI = new GoogleGenerativeAI(apiKey);

// ============================================================
// AI RESPONSE SCHEMA
// ============================================================

const AIAnalysisSchema = z.object({
  // ----------------------------------------------------------
  // Candidate information extracted from resume
  // ----------------------------------------------------------

  candidate: z.object({
    name: z.string(),

    email: z.string(),

    phone: z.string(),

    totalExperienceYears: z
      .number()
      .min(0),
  }),

  // ----------------------------------------------------------
  // AI evaluation
  // ----------------------------------------------------------

  scoringRationale: z.string(),

  overallMatchScore: z
    .number()
    .min(0)
    .max(100),

  hardSkillsMatch: z.object({
    found: z.array(z.string()),

    missing: z.array(z.string()),
  }),

  mustHaveEvaluation: z.object({
    met: z.boolean(),

    reason: z.string(),
  }),

  redFlags: z.array(z.string()),

  executiveSummary: z.string(),
});

export type AIAnalysis =
  z.infer<typeof AIAnalysisSchema>;

// ============================================================
// ANALYZE CANDIDATE
// ============================================================

export async function analyzeCandidate(
  job: unknown,
  resumeText: string
): Promise<AIAnalysis> {

  // ----------------------------------------------------------
  // Validate resume
  // ----------------------------------------------------------

  if (
    !resumeText ||
    resumeText.trim().length === 0
  ) {
    throw new Error("Resume text is empty");
  }

  // ----------------------------------------------------------
  // Create Gemini model
  // ----------------------------------------------------------

  const model = genAI.getGenerativeModel({
    model: "gemini-3.6-flash",
    systemInstruction: SYSTEM_PROMPT,
  });

  // ----------------------------------------------------------
  // Build user prompt
  // ----------------------------------------------------------

  const userPrompt = buildUserPrompt(
    job,
    resumeText
  );

  console.log(
    "========== SENDING TO GEMINI =========="
  );

  console.log(
    "Resume characters:",
    resumeText.length
  );

  console.log(
    "======================================="
  );

  // ----------------------------------------------------------
  // Call Gemini
  // ----------------------------------------------------------

  const result =
    await model.generateContent({
      contents: [
        {
          role: "user",

          parts: [
            {
              text: userPrompt,
            },
          ],
        },
      ],

      generationConfig: {
        responseMimeType:
          "application/json",

        responseSchema: {
          type: "object",

          properties: {

            // ------------------------------------------------
            // Candidate
            // ------------------------------------------------

            candidate: {
              type: "object",

              properties: {
                name: {
                  type: "string",
                },

                email: {
                  type: "string",
                },

                phone: {
                  type: "string",
                },

                totalExperienceYears: {
                  type: "number",
                },
              },

              required: [
                "name",
                "email",
                "phone",
                "totalExperienceYears",
              ],
            },

            // ------------------------------------------------
            // Scoring rationale
            // ------------------------------------------------

            scoringRationale: {
              type: "string",
            },

            // ------------------------------------------------
            // Overall score
            // ------------------------------------------------

            overallMatchScore: {
              type: "number",
            },

            // ------------------------------------------------
            // Hard skills
            // ------------------------------------------------

            hardSkillsMatch: {
              type: "object",

              properties: {
                found: {
                  type: "array",

                  items: {
                    type: "string",
                  },
                },

                missing: {
                  type: "array",

                  items: {
                    type: "string",
                  },
                },
              },

              required: [
                "found",
                "missing",
              ],
            },

            // ------------------------------------------------
            // Must-have evaluation
            // ------------------------------------------------

            mustHaveEvaluation: {
              type: "object",

              properties: {
                met: {
                  type: "boolean",
                },

                reason: {
                  type: "string",
                },
              },

              required: [
                "met",
                "reason",
              ],
            },

            // ------------------------------------------------
            // Red flags
            // ------------------------------------------------

            redFlags: {
              type: "array",

              items: {
                type: "string",
              },
            },

            // ------------------------------------------------
            // Executive summary
            // ------------------------------------------------

            executiveSummary: {
              type: "string",
            },
          },

          required: [
            "candidate",
            "scoringRationale",
            "overallMatchScore",
            "hardSkillsMatch",
            "mustHaveEvaluation",
            "redFlags",
            "executiveSummary",
          ],
        },
      },
    });

  // ----------------------------------------------------------
  // Get Gemini response
  // ----------------------------------------------------------

  const responseText =
    result.response.text();

  if (!responseText) {
    throw new Error(
      "Gemini returned an empty response"
    );
  }

  console.log(
    "========== GEMINI RESPONSE =========="
  );

  console.log(responseText);

  console.log(
    "====================================="
  );

  // ----------------------------------------------------------
  // Parse JSON
  // ----------------------------------------------------------

  let parsedResponse: unknown;

  try {

    parsedResponse =
      JSON.parse(responseText);

  } catch (error) {

    console.error(
      "Gemini JSON parse error:",
      error
    );

    throw new Error(
      "Gemini returned invalid JSON"
    );
  }

  // ----------------------------------------------------------
  // Validate using Zod
  // ----------------------------------------------------------

  const validationResult =
    AIAnalysisSchema.safeParse(
      parsedResponse
    );

  if (!validationResult.success) {

    console.error(
      "Gemini response validation failed:"
    );

    console.error(
      validationResult.error
    );

    throw new Error(
      "Gemini response does not match the expected schema"
    );
  }

  // ----------------------------------------------------------
  // Return validated result
  // ----------------------------------------------------------

  return validationResult.data;
}