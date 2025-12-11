import UserCategoryOverride from "../models/userCategoryOverride.js";

// Comprehensive keyword rules for all 12 categories
const RULES = [
  {
    cat: "work",
    kws: [
      // Development
      "bug", "fix", "debug", "code", "programming", "develop", "implement", "deploy",
      "api", "endpoint", "backend", "frontend", "database", "query", "sql",
      // Project management
      "jira", "ticket", "issue", "task", "sprint", "scrum", "standup", "meeting",
      "client", "customer", "project", "deadline", "milestone", "deliverable",
      // Communication
      "email", "slack", "message", "call", "conference", "presentation", "demo",
      // Documentation
      "document", "write", "review", "pr", "pull request", "merge", "commit",
      // Testing
      "test", "qa", "quality", "verify", "validate", "check"
    ]
  },
  {
    cat: "personal",
    kws: [
      // Family
      "mom", "dad", "parent", "family", "son", "daughter", "sibling", "brother", "sister",
      // Social
      "friend", "friends", "hangout", "catch up", "chat", "talk",
      // Activities
      "dinner", "lunch", "breakfast", "meal", "restaurant", "cafe",
      "party", "celebration", "birthday", "wedding", "event",
      "movie", "film", "watch", "netflix", "tv", "show",
      "hobby", "game", "gaming", "play", "fun",
      // Communication
      "call", "phone", "text", "message", "chat"
    ]
  },
  {
    cat: "errands",
    kws: [
      // Shopping
      "grocery", "groceries", "shopping", "store", "market", "mall", "buy", "purchase",
      // Services
      "post office", "mail", "package", "ship", "delivery",
      "bank", "atm", "deposit", "withdraw", "transaction",
      "pharmacy", "prescription", "medicine",
      "gas", "fuel", "station", "fill up",
      // Appointments
      "appointment", "schedule", "booking",
      // Tasks
      "pickup", "drop off", "return", "exchange"
    ]
  },
  {
    cat: "design",
    kws: [
      // Design tools
      "figma", "sketch", "adobe", "photoshop", "illustrator", "xd", "invision",
      // Design activities
      "design", "ui", "ux", "wireframe", "mockup", "prototype", "layout",
      "logo", "brand", "branding", "identity", "visual",
      "color", "palette", "typography", "font", "icon",
      // Creative
      "creative", "art", "graphic", "illustration", "drawing", "sketch"
    ]
  },
  {
    cat: "engineering",
    kws: [
      // Development
      "code", "programming", "develop", "build", "implement", "architecture",
      "algorithm", "data structure", "optimize", "refactor", "debug",
      // Technologies
      "react", "node", "python", "java", "javascript", "typescript",
      "docker", "kubernetes", "aws", "cloud", "infrastructure",
      "database", "sql", "nosql", "mongodb", "postgres",
      // Engineering tasks
      "system design", "scalability", "performance", "security",
      "ci/cd", "pipeline", "deployment", "devops"
    ]
  },
  {
    cat: "marketing",
    kws: [
      // Marketing activities
      "marketing", "campaign", "promotion", "advertisement", "ad", "advert",
      "social media", "instagram", "facebook", "twitter", "linkedin", "post",
      "content", "blog", "article", "write", "copy", "copywriting",
      // Analytics
      "analytics", "metrics", "kpi", "roi", "conversion", "traffic",
      // Strategy
      "strategy", "planning", "research", "market", "competitor",
      // Events
      "event", "webinar", "workshop", "seminar", "conference"
    ]
  },
  {
    cat: "finance",
    kws: [
      // Financial tasks
      "finance", "budget", "expense", "income", "revenue", "profit", "loss",
      "accounting", "bookkeeping", "invoice", "receipt", "payment", "billing",
      // Investments
      "investment", "stock", "trading", "portfolio", "401k", "retirement",
      // Banking
      "bank", "account", "transfer", "transaction", "statement",
      // Taxes
      "tax", "taxes", "filing", "deduction", "refund",
      // Planning
      "financial planning", "savings", "loan", "mortgage", "credit"
    ]
  },
  {
    cat: "rest",
    kws: [
      // Sleep
      "sleep", "nap", "rest", "break", "pause",
      "bedtime", "wake up", "alarm",
      // Relaxation
      "relax", "unwind", "chill", "downtime", "leisure",
      "vacation", "holiday", "time off", "sick day"
    ]
  },
  {
    cat: "health",
    kws: [
      // Exercise
      "gym", "workout", "exercise", "fitness", "training",
      "run", "running", "jog", "jogging", "walk", "walking",
      "yoga", "pilates", "stretch", "stretching",
      "bike", "cycling", "swim", "swimming",
      "weight", "lifting", "strength", "cardio",
      // Wellness
      "meditate", "meditation", "mindfulness",
      "therapy", "counseling", "mental health",
      // Medical
      "doctor", "appointment", "checkup", "examination",
      "diet", "nutrition", "meal prep", "healthy eating"
    ]
  },
  {
    cat: "learning",
    kws: [
      // Education
      "study", "studying", "learn", "learning", "education",
      "course", "class", "lesson", "lecture", "tutorial",
      "read", "reading", "book", "textbook", "material",
      // Skills
      "practice", "training", "workshop", "seminar",
      // Technical learning
      "leetcode", "coding challenge", "algorithm", "data structure",
      "certification", "certificate", "exam", "test preparation",
      // Research
      "research", "paper", "article", "documentation"
    ]
  },
  {
    cat: "admin",
    kws: [
      // Communication
      "email", "emails", "inbox", "reply", "respond",
      // Organization
      "organize", "organization", "file", "filing", "sort",
      "clean", "cleaning", "tidy", "declutter",
      // Planning
      "plan", "planning", "schedule", "calendar", "appointment",
      // Tasks
      "task", "todo", "to-do", "checklist", "reminder",
      // Financial admin
      "bill", "bills", "pay", "payment", "invoice",
      "bank", "banking", "account", "statement",
      // Legal/Paperwork
      "paperwork", "form", "application", "submit", "document"
    ]
  },
  {
    cat: "other",
    kws: [
      // Generic catch-all (use sparingly)
      "misc", "miscellaneous", "other", "various", "random"
    ]
  }
];

function ruleGuess(text) {
  const t = (text || "").toLowerCase();
  
  // Check each category's keywords
  for (const { cat, kws } of RULES) {
    // Check if any keyword matches (substring match)
    if (kws.some(k => t.includes(k))) {
      return { categoryId: cat, confidence: 0.75, source: "rules" };
    }
  }
  
  return null;
}

export async function classifyForUser(userId, title) {
  const t = (title || "").toLowerCase().trim();
  if (!t) return { categoryId: "work", confidence: 0.5, source: "default" };

  // overrides first
  const overrides = await UserCategoryOverride.find({ userId }).lean();
  for (const o of overrides) {
    if (t.includes(o.pattern.toLowerCase())) {
      return { categoryId: o.categoryId, confidence: 0.95, source: "override" };
    }
  }

  // rules
  const viaRule = ruleGuess(t);
  if (viaRule) return viaRule;

  // fallback (placeholder ML hook)
  return { categoryId: "work", confidence: 0.5, source: "default" };
}