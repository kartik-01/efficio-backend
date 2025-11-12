import UserCategoryOverride from "../models/userCategoryOverride.js";

// very lightweight rules + overrides (placeholder for ML)
const RULES = [
  { cat: "health",   kws: ["gym","workout","run","walk","yoga","meditate"] },
  { cat: "learning", kws: ["study","course","tutorial","lecture","leetcode","read"] },
  { cat: "admin",    kws: ["email","invoice","bill","groceries","clean","bank","tax"] },
  { cat: "personal", kws: ["dad","mom","friend","dinner","party","hobby","movie","call"] },
  { cat: "rest",     kws: ["sleep","nap","rest"] },
  { cat: "work",     kws: ["jira","bug","deploy","ticket","client","sprint","api"] },
];

function ruleGuess(text) {
  const t = (text || "").toLowerCase();
  for (const { cat, kws } of RULES) {
    if (kws.some(k => t.includes(k))) return { categoryId: cat, confidence: 0.75, source: "rules" };
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