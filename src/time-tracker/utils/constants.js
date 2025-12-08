export const CATEGORIES = [
    { id: "work",        label: "Work / Projects",   color: "#3B82F6" },
    { id: "personal",    label: "Personal / Social", color: "#10B981" },
    { id: "errands",     label: "Errands",           color: "#FB923C" },
    { id: "design",      label: "Design",             color: "#EC4899" },
    { id: "engineering", label: "Engineering",       color: "#14B8A6" },
    { id: "marketing",   label: "Marketing",         color: "#EAB308" },
    { id: "finance",     label: "Finance",           color: "#6366F1" },
    { id: "rest",        label: "Rest / Sleep",      color: "#64748B" },
    { id: "health",      label: "Health / Wellness", color: "#10B981" },
    { id: "learning",    label: "Learning / Study",  color: "#8B5CF6" },
    { id: "admin",       label: "Admin / Chores",    color: "#F59E0B" },
    { id: "other",       label: "Other",             color: "#6B7280" },
  ];
  
  // Which categories count as "focus"
  export const FOCUS_CATEGORIES = new Set(["work", "learning"]);