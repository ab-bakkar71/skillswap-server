// AI Controller supporting Gemini API with smart fallback generation

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "";

/**
 * Helper to call Gemini REST API if key exists
 */
const callGeminiAPI = async (prompt) => {
  if (!GEMINI_API_KEY) return null;

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: {
          temperature: 0.7,
          responseMimeType: "application/json",
        },
      }),
    });

    if (!response.ok) {
      console.warn("Gemini API call failed:", response.status, response.statusText);
      return null;
    }

    const data = await response.json();
    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) return null;

    return JSON.parse(rawText);
  } catch (err) {
    console.warn("Gemini API parsing/network error:", err.message);
    return null;
  }
};

/**
 * Smart contextual task generator fallback
 */
const generateFallbackTask = (prompt, categoryHint) => {
  const p = (prompt || "").trim();
  const lower = p.toLowerCase();

  let category = categoryHint || "web-fixing";
  if (lower.includes("logo") || lower.includes("design") || lower.includes("banner") || lower.includes("flyer")) {
    category = "graphics-design";
  } else if (lower.includes("article") || lower.includes("blog") || lower.includes("write") || lower.includes("content") || lower.includes("copy")) {
    category = "content-writing";
  } else if (lower.includes("ui") || lower.includes("ux") || lower.includes("figma") || lower.includes("wireframe") || lower.includes("prototype")) {
    category = "ui-ux";
  } else if (lower.includes("data") || lower.includes("excel") || lower.includes("entry") || lower.includes("virtual assistant") || lower.includes("scrap")) {
    category = "data-entry";
  } else if (lower.includes("web") || lower.includes("react") || lower.includes("bug") || lower.includes("fix") || lower.includes("api") || lower.includes("next")) {
    category = "web-fixing";
  }

  const title = p.length > 5 
    ? p.charAt(0).toUpperCase() + p.slice(1)
    : `Develop High-Performance Solution for ${category.replace(/-/g, " ").toUpperCase()}`;

  let budget = 150;
  if (category === "web-fixing") budget = 220;
  if (category === "ui-ux") budget = 180;
  if (category === "graphics-design") budget = 120;
  if (category === "content-writing") budget = 90;
  if (category === "data-entry") budget = 65;

  const description = `### 📋 Project Overview
We are looking for an experienced professional to assist with **${title}**. The goal is to deliver clean, well-documented, and production-ready results in a timely manner.

### 🎯 Key Objectives & Deliverables
1. **Initial Assessment & Architecture:** Review the current requirements, identify potential edge cases, and define clear milestones.
2. **Implementation:** Build and deliver the required solution following industry best practices and standards.
3. **Testing & Optimization:** Ensure optimal performance, responsive layout/delivery, and error-free functionality.
4. **Documentation & Handover:** Provide a brief summary of work, instructions, and asset links upon completion.

### 🛠️ Required Skills & Experience
- Proven track record in ${category.replace(/-/g, " ")} and relevant tools.
- Strong problem-solving abilities, attention to detail, and transparent communication.
- Ability to meet deadlines and provide revisions if necessary.

Please include relevant samples or links to past work in your proposal. Looking forward to collaborating!`;

  return {
    title,
    category,
    description,
    budget,
    estimatedDays: 5,
  };
};

/**
 * Smart contextual proposal generator fallback
 */
const generateFallbackProposal = ({ taskTitle, taskDescription, category, budget, freelancerName }) => {
  const name = freelancerName || "Professional Freelancer";
  const numBudget = Number(budget) || 100;
  // Recommend a competitive bid (~90-95% of client budget or match)
  const proposedBudget = Math.max(20, Math.round(numBudget * 0.95));
  const estimatedDays = numBudget > 300 ? 6 : numBudget > 150 ? 4 : 2;

  const coverNote = `Hi there! 👋

I reviewed your task "${taskTitle}" and I am confident that I can deliver exceptional results that meet all your expectations.

Why I'm the ideal match for your project:
• Expertise in ${category ? category.replace(/-/g, " ") : "this field"} with a strong background in delivering top-tier solutions.
• Quick turnaround time: I can complete the scope cleanly within ${estimatedDays} days.
• Clean, maintainable execution with clear communication at every milestone.
• Free post-delivery support and revisions to guarantee 100% satisfaction.

I have already outlined a clear action plan to get started immediately. I'd love to discuss any specific preferences you have.

Looking forward to working with you!
Best regards,
${name}`;

  return {
    proposedBudget,
    estimatedDays,
    coverNote,
  };
};

/**
 * POST /api/ai/generate-task
 */
const generateTask = async (req, res) => {
  try {
    const { prompt, category: categoryHint, budget: budgetHint } = req.body || {};

    if (!prompt || typeof prompt !== "string" || prompt.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: "A prompt or brief description is required to generate task content.",
      });
    }

    // Try Gemini API first if configured
    if (GEMINI_API_KEY) {
      const systemPrompt = `You are an expert project manager for a freelance marketplace called SkillSwap.
The user wants to post a task based on this prompt: "${prompt}".
${categoryHint ? `Preferred category hint: "${categoryHint}".` : ""}
${budgetHint ? `Preferred budget hint: "${budgetHint}".` : ""}

Generate a JSON object with:
- "title": A concise, attractive task title (5-10 words).
- "category": Choose the single best fit strictly from: ["web-fixing", "graphics-design", "content-writing", "ui-ux", "data-entry"].
- "description": A comprehensive, beautifully formatted Markdown description with "### Project Overview", "### Key Deliverables", and "### Requirements".
- "budget": A realistic suggested budget in USD as a number (e.g. 150).
- "estimatedDays": Suggested completion days as a number (e.g. 4).

Respond strictly with valid JSON.`;

      const aiResult = await callGeminiAPI(systemPrompt);
      if (aiResult && aiResult.title && aiResult.description) {
        return res.status(200).json({
          success: true,
          data: {
            title: aiResult.title,
            category: aiResult.category || categoryHint || "web-fixing",
            description: aiResult.description,
            budget: Number(aiResult.budget) || Number(budgetHint) || 150,
            estimatedDays: Number(aiResult.estimatedDays) || 5,
          },
          source: "gemini",
        });
      }
    }

    // Fallback to intelligent rule-based generation
    const fallbackData = generateFallbackTask(prompt, categoryHint);
    if (budgetHint && Number(budgetHint) > 0) {
      fallbackData.budget = Number(budgetHint);
    }

    return res.status(200).json({
      success: true,
      data: fallbackData,
      source: "contextual-ai",
    });
  } catch (error) {
    console.error("Error in generateTask AI controller:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error generating task content.",
    });
  }
};

/**
 * POST /api/ai/generate-proposal
 */
const generateProposal = async (req, res) => {
  try {
    const { taskTitle, taskDescription, category, budget, freelancerName } = req.body || {};

    if (!taskTitle) {
      return res.status(400).json({
        success: false,
        message: "Task title is required to generate a proposal.",
      });
    }

    // Try Gemini API first if configured
    if (GEMINI_API_KEY) {
      const systemPrompt = `You are a top-rated professional freelancer submitting a proposal on SkillSwap.
Task Title: "${taskTitle}"
Category: "${category || "general"}"
Client Budget: "$${budget || 100}"
Task Details: "${(taskDescription || "").slice(0, 1000)}"
Freelancer Name: "${freelancerName || "Applicant"}"

Write an engaging, persuasive, and professional proposal.
Return a JSON object with:
- "coverNote": A well-crafted cover letter addressing the task requirements directly, highlighting problem-solving, relevant skills, and enthusiasm.
- "proposedBudget": A realistic, competitive budget number in USD (near or slightly below client budget).
- "estimatedDays": A realistic turnaround time in days as a number.

Respond strictly with valid JSON.`;

      const aiResult = await callGeminiAPI(systemPrompt);
      if (aiResult && aiResult.coverNote) {
        return res.status(200).json({
          success: true,
          data: {
            coverNote: aiResult.coverNote,
            proposedBudget: Number(aiResult.proposedBudget) || Number(budget) || 100,
            estimatedDays: Number(aiResult.estimatedDays) || 3,
          },
          source: "gemini",
        });
      }
    }

    // Fallback to contextual generator
    const fallbackData = generateFallbackProposal({
      taskTitle,
      taskDescription,
      category,
      budget,
      freelancerName,
    });

    return res.status(200).json({
      success: true,
      data: fallbackData,
      source: "contextual-ai",
    });
  } catch (error) {
    console.error("Error in generateProposal AI controller:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error generating proposal draft.",
    });
  }
};

/**
 * Fallback summary generator
 */
const generateFallbackProposalSummary = ({ taskTitle, proposedBudget, estimatedDays, coverNote, status }) => {
  const budgetStr = proposedBudget ? `$${proposedBudget}` : "competitive rate";
  const daysStr = estimatedDays ? `${estimatedDays} days` : "prompt delivery";

  const executiveSummary = `Targeted bid for "${taskTitle || "task"}" proposing ${budgetStr} with delivery in ${daysStr}. Highlights direct problem resolution, high code standards, and reliable milestone turnaround.`;

  const keyStrengths = [
    `Competitive bid (${budgetStr}) strategically calibrated to project budget.`,
    `Realistic ${daysStr} turnaround with room for review and refinement.`,
    `Clear commitment to quality deliverables and client collaboration.`,
  ];

  const competitivenessScore = status === "accepted" ? 96 : status === "completed" ? 99 : 91;

  const winStrategyTip = status === "accepted"
    ? "Review deliverables early and keep communication open with the client."
    : status === "completed"
    ? "Great job completing this! Consider asking the client for a 5-star review."
    : "Be ready for client messages; quick response times significantly increase hiring chances.";

  return {
    executiveSummary,
    keyStrengths,
    competitivenessScore,
    winStrategyTip,
  };
};

/**
 * POST /api/ai/summarize-proposal
 */
const summarizeProposal = async (req, res) => {
  try {
    const { taskTitle, proposedBudget, estimatedDays, coverNote, status } = req.body || {};

    if (GEMINI_API_KEY) {
      const prompt = `You are an expert freelance proposal evaluator and career coach on SkillSwap.
Analyze this proposal submitted by a freelancer:
Task: "${taskTitle || "N/A"}"
Bid: "$${proposedBudget || "N/A"}"
Estimated Duration: "${estimatedDays || "N/A"} days"
Status: "${status || "pending"}"
Cover Note: "${(coverNote || "").slice(0, 1500)}"

Return a JSON object with:
- "executiveSummary": A concise 1-2 sentence executive summary of this proposal's core value proposition.
- "keyStrengths": An array of 3 bullet points outlining strong points of this pitch.
- "competitivenessScore": A score number from 80 to 98 (e.g. 92).
- "winStrategyTip": One actionable, helpful tip for the freelancer to succeed.

Respond strictly with valid JSON.`;

      const aiResult = await callGeminiAPI(prompt);
      if (aiResult && aiResult.executiveSummary) {
        return res.status(200).json({
          success: true,
          data: {
            executiveSummary: aiResult.executiveSummary,
            keyStrengths: Array.isArray(aiResult.keyStrengths) ? aiResult.keyStrengths : [],
            competitivenessScore: Number(aiResult.competitivenessScore) || 92,
            winStrategyTip: aiResult.winStrategyTip || "Respond promptly to client questions to maintain high engagement.",
          },
          source: "gemini",
        });
      }
    }

    const fallback = generateFallbackProposalSummary({
      taskTitle,
      proposedBudget,
      estimatedDays,
      coverNote,
      status,
    });

    return res.status(200).json({
      success: true,
      data: fallback,
      source: "contextual-ai",
    });
  } catch (error) {
    console.error("Error in summarizeProposal AI controller:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error generating proposal summary.",
    });
  }
};

module.exports = {
  generateTask,
  generateProposal,
  summarizeProposal,
};
