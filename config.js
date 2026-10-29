// Public by design: the publishable key only grants what RLS + RPC grants allow.
window.FG_CONFIG = {
  SUPABASE_URL: "https://fnqrkfwdmnroutkttezp.supabase.co",
  // Legacy anon JWT: the well-tested path for supabase-js 2.45 REST + Realtime.
  SUPABASE_PUBLISHABLE_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZucXJrZndkbW5yb3V0a3R0ZXpwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIzNTYxNDMsImV4cCI6MjEwNzkzMjE0M30.JxRPhmWf1e_s1zrX2k7wJqNDpdMz39Uo7SiMndqBS1I",

  EVENT_START: "2026-11-08T00:00:00Z", // Sat Nov 7, 6:00 PM CST
  SIGNUP_DEADLINE: "2026-11-04T05:59:59Z", // end of Tue Nov 3 CST (soft)

  CATEGORIES: [
    { key: "main", label: "Main dishes" },
    { key: "side", label: "Sides" },
    { key: "starch", label: "Starches (potatoes, stuffing, mac)" },
    { key: "veg", label: "Veggies & salads" },
    { key: "bread", label: "Rolls & bread" },
    { key: "app", label: "Appetizers" },
    { key: "dessert", label: "Desserts" },
    { key: "drink", label: "Drinks (non-alcoholic, wine, beer)" },
    { key: "nocook", label: "No-cook (ice, cups, napkins, to-go containers)" },
  ],

  // One line is picked at random for each popup after an RSVP.
  RSVP_NO_LINES: [
    "Well, that's un-pie-lievable. We'll save you a slice of disappointment.",
    "We're not crying, we're just basting in our own tears.",
    "The turkey is taking this harder than the oven will.",
    "You've left us feeling stuffed… with sadness.",
    "We'll try not to be too crumb-y about it.",
    "Our hearts are mashed. Lumpy, even.",
    "It's gourd to hear, but we understand.",
  ],
  RSVP_YES_LINES: [
    "Don't just show up and gobble. Grab a slot below!",
    "Lettuce be honest: showing up empty-handed is a little hard to swallow.",
    "We yam so glad you're coming! The board is looking a little thin, though…",
    "You know what pairs beautifully with your presence? A side dish.",
    "Don't leaf us hanging. There are still open slots!",
    "Great! Now let's talk about what you're brining.",
    "A guest without a dish is just a mouth with a parking spot.",
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
