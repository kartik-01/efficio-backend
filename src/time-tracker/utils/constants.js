export const CATEGORIES = [
    { id: "work",     label: "Work / Projects",   color: "#3B82F6" },
    { id: "learning", label: "Learning / Study",  color: "#8B5CF6" },
    { id: "admin",    label: "Admin / Chores",    color: "#F59E0B" },
    { id: "health",   label: "Health / Wellness", color: "#10B981" },
    { id: "personal", label: "Personal / Social", color: "#EC4899" },
    { id: "rest",     label: "Rest / Sleep",      color: "#64748B" },
  ];
  
  // Which categories count as “focus”
  export const FOCUS_CATEGORIES = new Set(["work", "learning"]);