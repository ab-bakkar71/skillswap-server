// AI Controller supporting Gemini API with smart fallback generation
const { getCollections } = require("../config/db");

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
 * Helper to call Gemini REST API for multi-turn chatbot conversation
 */
const callGeminiChatAPI = async (systemInstruction, history = [], userMessage) => {
  if (!GEMINI_API_KEY) return null;

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;

    const contents = [];

    // Prepend system context as prime instruction
    if (systemInstruction) {
      contents.push({
        role: "user",
        parts: [{ text: `[SYSTEM CONTEXT & INSTRUCTIONS]:\n${systemInstruction}\nPlease acknowledge understanding.` }],
      });
      contents.push({
        role: "model",
        parts: [{ text: "Understood. I am SwapAi Assistant, the intelligent assistant for SkillSwap. I will adhere strictly to these rules." }],
      });
    }

    // Append history (last 6 turns)
    if (Array.isArray(history)) {
      for (const msg of history.slice(-6)) {
        const text = msg.content || msg.text || "";
        if (!text) continue;
        const role = (msg.role === "assistant" || msg.role === "model" || msg.sender === "bot") ? "model" : "user";
        contents.push({
          role,
          parts: [{ text }],
        });
      }
    }

    // Append current user message
    contents.push({
      role: "user",
      parts: [{ text: userMessage }],
    });

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents,
        generationConfig: {
          temperature: 0.7,
          responseMimeType: "application/json",
        },
      }),
    });

    if (!response.ok) {
      console.warn("Gemini Chat API call failed:", response.status, response.statusText);
      return null;
    }

    const data = await response.json();
    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) return null;

    return JSON.parse(rawText);
  } catch (err) {
    console.warn("Gemini Chat API error:", err.message);
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

/**
 * Fallback task summary & bidding verdict generator
 */
const generateFallbackTaskSummary = ({ title, description, category, budget, deadline }) => {
  const numBudget = Number(budget) || 100;
  const cat = category || "web-fixing";

  let complexity = "Medium";
  let estimatedEffort = "2-4 Days";
  let verdict = "Highly Recommended to Bid";
  let verdictType = "positive";
  let verdictReason = "Clear project scope and fair budget proportion. Excellent match for freelancers with relevant domain skills.";
  let requiredSkills = ["Problem Solving", "Timely Delivery", "Attention to Detail"];

  if (cat === "web-fixing") {
    requiredSkills = ["Frontend Debugging", "CSS / Responsive Layout", "JavaScript / React", "Browser Compatibility"];
    complexity = numBudget > 200 ? "Medium" : "Low";
    estimatedEffort = "1-3 Days";
  } else if (cat === "graphics-design") {
    requiredSkills = ["Figma", "Vector Graphics", "Brand Identity", "Visual Aesthetics"];
    complexity = "Low";
    estimatedEffort = "2-3 Days";
  } else if (cat === "ui-ux") {
    requiredSkills = ["Figma", "UI Design System", "Wireframing", "Component Layout"];
    complexity = "Medium";
    estimatedEffort = "3-5 Days";
  } else if (cat === "content-writing") {
    requiredSkills = ["SEO Content", "Research & Fact-Checking", "Proofreading"];
    complexity = "Low";
    estimatedEffort = "1-2 Days";
  } else if (cat === "data-entry") {
    requiredSkills = ["Excel / Google Sheets", "Data Cleansing", "High Accuracy"];
    complexity = "Low";
    estimatedEffort = "1-2 Days";
  }

  if (numBudget < 35) {
    verdict = "Consider Carefully";
    verdictType = "caution";
    verdictReason = "Budget is on the lower side. Ensure the scope is strictly minimal before placing a bid.";
  } else if (numBudget >= 120) {
    verdict = "Highly Recommended to Bid";
    verdictType = "positive";
    verdictReason = "Strong client budget with healthy reward-to-effort ratio. Great chance to earn and build ratings.";
  } else {
    verdict = "Good Opportunity";
    verdictType = "neutral";
    verdictReason = "Fair compensation matching market standard micro-tasks. Suitable for building client relations.";
  }

  const executiveSummary = `Client requires assistance with "${title || "task"}". The focus is on clean deliverables, milestone turnaround, and problem resolution within ${estimatedEffort}.`;

  return {
    executiveSummary,
    verdict,
    verdictType,
    verdictReason,
    complexity,
    budgetEvaluation: numBudget >= 120 ? `Generous Budget ($${numBudget})` : `Fair Rate ($${numBudget})`,
    estimatedEffort,
    requiredSkills,
    winningTip: `Emphasize relevant work samples and confirm you can deliver within ${estimatedEffort} to stand out.`,
  };
};

/**
 * POST /api/ai/summarize-task
 * Summarizes task requirements and gives bidding advice for freelancers
 */
const summarizeTask = async (req, res) => {
  try {
    const { title, description, category, budget, deadline } = req.body || {};

    if (!title && !description) {
      return res.status(400).json({
        success: false,
        message: "Task information is required.",
      });
    }

    if (GEMINI_API_KEY) {
      const prompt = `You are a career mentor and senior proposal consultant for freelancers on SkillSwap.
A freelancer is evaluating this task to decide whether to submit a proposal:
Task Title: "${title || "N/A"}"
Category: "${category || "general"}"
Client Budget: "$${budget || "N/A"}"
Client Deadline: "${deadline || "Flexible"}"
Task Description: "${(description || "").slice(0, 1500)}"

Evaluate the task carefully and respond strictly with a valid JSON object containing:
- "executiveSummary": A concise 1-2 sentence executive summary explaining what the client actually needs done.
- "verdict": Short verdict string, strictly one of: ["Highly Recommended to Bid", "Good Opportunity", "Consider Carefully"].
- "verdictType": Strictly one of: ["positive", "neutral", "caution"].
- "verdictReason": 1-2 sentences explaining why the freelancer should or shouldn't bid (evaluating budget vs effort, clarity of instructions).
- "complexity": "Low", "Medium", or "High".
- "budgetEvaluation": A short phrase assessing the budget (e.g. "Fair Rate for Scope", "Generous Budget", or "Low for Workload").
- "estimatedEffort": Realistic effort duration (e.g. "2-3 Days").
- "requiredSkills": Array of 3-4 key skill strings needed to succeed.
- "winningTip": One practical tip for writing a winning pitch for this specific task.`;

      const aiResult = await callGeminiAPI(prompt);
      if (aiResult && aiResult.executiveSummary && aiResult.verdict) {
        return res.status(200).json({
          success: true,
          data: {
            executiveSummary: aiResult.executiveSummary,
            verdict: aiResult.verdict,
            verdictType: aiResult.verdictType || "positive",
            verdictReason: aiResult.verdictReason || "Task provides clear scope and attainable requirements.",
            complexity: aiResult.complexity || "Medium",
            budgetEvaluation: aiResult.budgetEvaluation || "Fair Market Rate",
            estimatedEffort: aiResult.estimatedEffort || "2-3 Days",
            requiredSkills: Array.isArray(aiResult.requiredSkills) ? aiResult.requiredSkills : [],
            winningTip: aiResult.winningTip || "Demonstrate prior experience with similar projects in your cover note.",
          },
          source: "gemini",
        });
      }
    }

    const fallback = generateFallbackTaskSummary({
      title,
      description,
      category,
      budget,
      deadline,
    });

    return res.status(200).json({
      success: true,
      data: fallback,
      source: "contextual-ai",
    });
  } catch (error) {
    console.error("Error in summarizeTask AI controller:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error analyzing task.",
    });
  }
};

/**
 * Smart contextual fallback reply generator for SwapAi Assistant
 */
const generateFallbackChatReply = ({ message, openTasks = [], userStats }) => {
  const q = (message || "").toLowerCase().trim();

  // 1. Bengali / English Greetings
  if (
    q.includes("hi") ||
    q.includes("hello") ||
    q.includes("hey") ||
    q.includes("সালাম") ||
    q.includes("কেমন") ||
    q.includes("help") ||
    q.length < 4
  ) {
    return {
      reply:
        "Hello! 👋 I'm **SwapAi Assistant**, your intelligent assistant for SkillSwap.\n\n" +
        "I can help you with:\n" +
        "- 🔍 **Finding live tasks** matching your skills\n" +
        "- ✍️ **Drafting a task description** for clients\n" +
        "- 💡 **Proposal winning strategies** for freelancers\n" +
        "- ❓ **Platform rules & escrow payment** questions\n\n" +
        "What would you like to explore today?",
      suggestedChips: [
        "🔍 Find active tasks",
        "✍️ Help me post a task",
        "💡 How to win proposals",
        "❓ How does SkillSwap work?",
      ],
    };
  }

  // 2. Task Discovery / Search
  if (
    q.includes("task") ||
    q.includes("job") ||
    q.includes("কাজ") ||
    q.includes("find") ||
    q.includes("search") ||
    q.includes("খোঁজ") ||
    q.includes("react") ||
    q.includes("web") ||
    q.includes("design") ||
    q.includes("logo")
  ) {
    if (openTasks && openTasks.length > 0) {
      const taskList = openTasks
        .slice(0, 4)
        .map(
          (t) =>
            `- **[${t.title}](/tasks/${t._id})**\n  Budget: **$${t.budget}** | Category: *${t.category}*`
        )
        .join("\n\n");

      return {
        reply:
          "Here are recent open tasks available on SkillSwap right now:\n\n" +
          taskList +
          "\n\n👉 You can browse all tasks on the [Browse Tasks](/tasks) page!",
        suggestedChips: [
          "Browse all tasks",
          "Tips to win proposals",
          "How to post a task",
        ],
      };
    } else {
      return {
        reply:
          "You can browse all currently available tasks on the [Browse Tasks](/tasks) page! Use filters to find tasks in Web Development, Graphic Design, Content Writing, and more.",
        suggestedChips: [
          "Browse all tasks",
          "How to submit a proposal",
          "Post a new task",
        ],
      };
    }
  }

  // 3. Post a task / Help client
  if (
    q.includes("post") ||
    q.includes("create") ||
    q.includes("হায়ার") ||
    q.includes("hire") ||
    q.includes("client") ||
    q.includes("পোস্ট") ||
    q.includes("ড্রাফট")
  ) {
    return {
      reply:
        "Posting a task on SkillSwap is quick and effortless! 🚀\n\n" +
        "1. Visit the [Create Task Page](/dashboard/client/create-task) (or click 'Post a Task').\n" +
        "2. Add a clear title, scope of deliverables, and budget.\n" +
        "3. You can even use our **AI Task Assistant** to auto-generate the description in seconds!\n" +
        "4. Freelancers will submit proposals, and you can review their cover notes and accept the best fit.",
      suggestedChips: [
        "Go to Create Task",
        "How do payments work?",
        "🔍 Find active tasks",
      ],
    };
  }

  // 4. Proposal tips & winning strategies
  if (
    q.includes("proposal") ||
    q.includes("প্রপোজাল") ||
    q.includes("bid") ||
    q.includes("win") ||
    q.includes("cover note") ||
    q.includes("টিপস")
  ) {
    return {
      reply:
        "Here are 4 proven tips to win more proposals on SkillSwap: 🏆\n\n" +
        "1. **Directly address the client's problem**: Don't use a generic template. Reference the exact task scope.\n" +
        "2. **Highlight relevant work**: Mention 1 or 2 specific projects similar to the task.\n" +
        "3. **Clear delivery timeline**: Specify how you will achieve the milestones within the deadline.\n" +
        "4. **Leverage AI Assistant**: On any task page, check the **AI Task Summary** to ensure it's a good match before submitting!",
      suggestedChips: [
        "🔍 Find tasks to bid on",
        "View My Proposals",
        "How SkillSwap works",
      ],
    };
  }

  // 5. Platform guidance & Escrow
  if (
    q.includes("how") ||
    q.includes("কিভাবে") ||
    q.includes("rules") ||
    q.includes("payment") ||
    q.includes("escrow") ||
    q.includes("টাকা") ||
    q.includes("safe") ||
    q.includes("fee")
  ) {
    return {
      reply:
        "Here is how SkillSwap works: 🤝\n\n" +
        "- **Escrow Protection**: Client funds are held securely when hiring and only released once the deliverable is completed and approved.\n" +
        "- **Transparent Workflow**: Clients and freelancers can communicate, submit proposals, track progress, and exchange reviews.\n" +
        "- **Dashboard Management**: Monitor your active work anytime on the [Dashboard](/dashboard).",
      suggestedChips: [
        "🔍 Explore Tasks",
        "✍️ Post a Task",
        "Go to Dashboard",
      ],
    };
  }

  // 6. User Status
  if (
    q.includes("status") ||
    q.includes("স্ট্যাটাস") ||
    q.includes("আমার") ||
    q.includes("my")
  ) {
    if (userStats) {
      return {
        reply:
          `Here is your current SkillSwap activity snapshot:\n\n` +
          `- **Pending Proposals**: ${userStats.pendingProposals}\n` +
          `- **Active Client Tasks**: ${userStats.clientTasks}\n\n` +
          `You can view complete details in your [Dashboard](/dashboard)!`,
        suggestedChips: [
          "View My Proposals",
          "🔍 Find more tasks",
          "Post a new task",
        ],
      };
    }
  }

  // Default helpful response
  return {
    reply:
      "I'm here to help you get the most out of SkillSwap! 🚀\n\n" +
      "You can ask me to find tasks, guide you through posting a new task, share tips on writing winning proposals, or explain platform rules and payments.\n\n" +
      "Quick links:\n" +
      "- [Browse All Tasks](/tasks)\n" +
      "- [Post a Task](/dashboard/client/create-task)\n" +
      "- [My Dashboard](/dashboard)",
    suggestedChips: [
      "🔍 Find active tasks",
      "✍️ Help me post a task",
      "💡 Proposal winning tips",
      "❓ How does SkillSwap work?",
    ],
  };
};

/**
 * Controller: AI Chatbot conversation with platform context
 */
const chatWithAI = async (req, res) => {
  try {
    const { message, history, userEmail, userRole } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({
        success: false,
        message: "Message is required.",
      });
    }

    // 1. Fetch live contextual data from MongoDB
    let openTasks = [];
    let userStats = null;

    try {
      const collections = getCollections();
      if (collections?.taskCollection) {
        openTasks = await collections.taskCollection
          .find({ status: "open" })
          .sort({ createdAt: -1 })
          .limit(6)
          .project({ title: 1, budget: 1, category: 1, requiredSkills: 1, _id: 1 })
          .toArray();
      }

      if (userEmail && collections?.proposalCollection && collections?.taskCollection) {
        const pendingProposals = await collections.proposalCollection.countDocuments({
          freelancerEmail: userEmail,
          status: "pending",
        });
        const clientTasks = await collections.taskCollection.countDocuments({
          clientEmail: userEmail,
          status: "open",
        });
        userStats = { pendingProposals, clientTasks };
      }
    } catch (dbErr) {
      console.warn("Notice: Contextual DB fetch in chatWithAI:", dbErr.message);
    }

    // 2. Format system instruction with live data
    const tasksSummary = (openTasks || [])
      .map(
        (t) =>
          `ID: ${t._id}, Title: "${t.title}", Category: ${t.category}, Budget: $${t.budget}`
      )
      .join("\n");

    const systemInstruction = `You are SwapAi Assistant, the intelligent assistant for the SkillSwap freelancing platform.
Key Platform Links:
- Browse Tasks: /tasks
- Task Details: /tasks/:id
- Client Post Task: /dashboard/client/create-task
- Freelancer Proposals: /dashboard/freelancer/my-proposals
- User Dashboard: /dashboard

Current Open Tasks in Database:
${tasksSummary || "No open tasks at the moment."}

User Info:
- Email: ${userEmail || "Guest"}
- Role: ${userRole || "Visitor"}
${userStats ? `- Pending Proposals: ${userStats.pendingProposals}, Open Posted Tasks: ${userStats.clientTasks}` : ""}

Rules:
1. Always be polite, concise, professional, and friendly.
2. If the user greets or asks in Bengali, reply in natural Bengali. If in English, reply in English.
3. When referencing tasks or pages, use markdown links like [Task Name](/tasks/id) or [Browse Tasks](/tasks).
4. If asked to find tasks, recommend matching items from the Current Open Tasks list above.
5. If asked to draft a task post, provide title, description, skills, and budget guidance.
6. Provide short, actionable follow-up prompt suggestions in "suggestedChips".
7. You MUST return a JSON object with this structure:
{
  "reply": "Markdown formatted string",
  "suggestedChips": ["chip 1", "chip 2", "chip 3"]
}`;

    // 3. Call Gemini if available
    if (GEMINI_API_KEY) {
      const aiResult = await callGeminiChatAPI(systemInstruction, history, message);
      if (aiResult && aiResult.reply) {
        return res.status(200).json({
          success: true,
          data: {
            reply: aiResult.reply,
            suggestedChips: Array.isArray(aiResult.suggestedChips)
              ? aiResult.suggestedChips
              : ["🔍 Find active tasks", "✍️ Post a task", "💡 Proposal tips"],
          },
          source: "gemini",
        });
      }
    }

    // 4. Fallback contextual responder
    const fallback = generateFallbackChatReply({
      message,
      openTasks,
      userStats,
      userRole,
    });

    return res.status(200).json({
      success: true,
      data: fallback,
      source: "contextual-ai",
    });
  } catch (error) {
    console.error("Error in chatWithAI controller:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error processing chat message.",
    });
  }
};

module.exports = {
  generateTask,
  generateProposal,
  summarizeProposal,
  summarizeTask,
  chatWithAI,
};
