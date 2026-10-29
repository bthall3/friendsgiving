// Public by design: the publishable key only grants what RLS + RPC grants allow.
window.FG_CONFIG = {
  SUPABASE_URL: "https://fnqrkfwdmnroutkttezp.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "REPLACE_WITH_PUBLISHABLE_KEY",

  EVENT_START: "2026-11-08T00:00:00Z", // Sat Nov 7, 6:00 PM CST
  SIGNUP_DEADLINE: "2026-11-04T05:59:59Z", // end of Tue Nov 3 CST (soft)

  CATEGORIES: [
    { key: "side", label: "Sides" },
    { key: "starch", label: "Starches (potatoes, stuffing, mac)" },
    { key: "veg", label: "Veggies & salads" },
    { key: "bread", label: "Rolls & bread" },
    { key: "app", label: "Appetizers" },
    { key: "dessert", label: "Desserts" },
    { key: "drink", label: "Drinks (non-alcoholic, wine, beer)" },
    { key: "nocook", label: "No-cook (ice, cups, napkins, to-go containers)" },
  ],

  TAGS: [
    { key: "vegetarian", label: "Vegetarian" },
    { key: "vegan", label: "Vegan" },
    { key: "gluten-free", label: "Gluten-free" },
    { key: "dairy-free", label: "Dairy-free" },
    { key: "contains-nuts", label: "Contains nuts" },
  ],

  NEEDS: [
    { key: "oven", label: "Oven", icon: "♨️" },
    { key: "stovetop", label: "Stovetop", icon: "🍳" },
    { key: "fridge", label: "Fridge", icon: "🧊" },
    { key: "outlet", label: "Outlet (crockpot etc.)", icon: "🔌" },
  ],
};
