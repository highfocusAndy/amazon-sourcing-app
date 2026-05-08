/**
 * Static category and subcategory list for Explorer. No API call—used in-app only.
 * Matches Amazon marketplace top-level browse categories.
 */

// ─── Marketplace metadata ────────────────────────────────────────────────────

export const MARKETPLACE_DOMAIN_MAP: Record<string, string> = {
  ATVPDKIKX0DER: "amazon.com",    // USA
  A2EUQ1WTGCTBG2: "amazon.ca",    // Canada
  A1AM78C64UM0Y8: "amazon.com.mx", // Mexico
  A1F83G8C2ARO7P: "amazon.co.uk", // UK
  A1PA6795UKMFR9: "amazon.de",    // Germany
  A13V1IB3VIYZZH: "amazon.fr",    // France
  A1C3SOZRARQ6R3: "amazon.es",    // Spain
  APJ6JRA9NG5M4:  "amazon.it",    // Italy
  A21TJRUUN4KGV:  "amazon.in",    // India
  A19VAU5U5O7RUS: "amazon.com.mx",// Mexico (alt ID)
  A2Q3Y263D00KWC: "amazon.com.br",// Brazil
};

export function getMarketplaceDomain(marketplaceId: string | null | undefined): string {
  return MARKETPLACE_DOMAIN_MAP[marketplaceId ?? ""] ?? "amazon.com";
}

// ─── USA / Canada (shared — virtually identical category tree) ───────────────

const CATEGORIES_USA: string[] = [
  "Appliances",
  "Apps & Games",
  "Arts, Crafts & Sewing",
  "Automotive",
  "Baby",
  "Beauty & Personal Care",
  "Books",
  "Camera & Photo",
  "CDs & Vinyl",
  "Cell Phones & Accessories",
  "Clothing, Shoes & Jewelry",
  "Collectible Currencies",
  "Collectibles & Fine Art",
  "Computers & Accessories",
  "Electronics",
  "Grocery & Gourmet Food",
  "Handmade Products",
  "Health & Household",
  "Home & Kitchen",
  "Industrial & Scientific",
  "Kindle Store",
  "Luggage & Travel Gear",
  "Movies & TV",
  "Musical Instruments",
  "Office Products",
  "Patio, Lawn & Garden",
  "Pet Supplies",
  "Software",
  "Sports & Outdoors",
  "Tools & Home Improvement",
  "Toys & Games",
  "Video Games",
  "Watches",
];

// Canada shares the same top-level structure as USA
const CATEGORIES_CANADA: string[] = CATEGORIES_USA.filter(
  (c) => c !== "Collectible Currencies", // not a prominent browse node on amazon.ca
);

// Mexico — same structure, English terms still work with SP-API
const CATEGORIES_MEXICO: string[] = CATEGORIES_USA.filter(
  (c) => !["Collectible Currencies", "Handmade Products"].includes(c),
);

// UK / EU — standard Amazon.co.uk top-level categories
const CATEGORIES_UK: string[] = [
  "Automotive",
  "Baby",
  "Beauty",
  "Books",
  "Camera & Photo",
  "CDs & Vinyl",
  "Clothing",
  "Computers & Accessories",
  "DIY & Tools",
  "Electronics",
  "Garden & Outdoors",
  "Grocery",
  "Health & Personal Care",
  "Home & Kitchen",
  "Jewellery",
  "Kitchen & Home",
  "Musical Instruments",
  "Office Products",
  "PC & Video Games",
  "Pet Supplies",
  "Sports & Outdoors",
  "Stationery & Office Supplies",
  "Toys & Games",
  "Watches",
];

/** Returns the top-level category list for the given SP-API marketplace ID. */
export function getCategoriesForMarketplace(marketplaceId: string | null | undefined): string[] {
  switch (marketplaceId) {
    case "A2EUQ1WTGCTBG2": return CATEGORIES_CANADA;  // Canada
    case "A1AM78C64UM0Y8": return CATEGORIES_MEXICO;  // Mexico
    case "A1F83G8C2ARO7P": return CATEGORIES_UK;      // UK
    case "A1PA6795UKMFR9": return CATEGORIES_UK;      // Germany (same structure)
    case "A13V1IB3VIYZZH": return CATEGORIES_UK;      // France
    case "A1C3SOZRARQ6R3": return CATEGORIES_UK;      // Spain
    case "APJ6JRA9NG5M4":  return CATEGORIES_UK;      // Italy
    default:               return CATEGORIES_USA;     // USA + fallback
  }
}

/** For backward-compat — always the US/default list. */
export const TOP_LEVEL_CATEGORIES = CATEGORIES_USA;

// ─── Subcategories ───────────────────────────────────────────────────────────

export const SUBCATEGORIES: Record<string, string[]> = {
  "Appliances": ["Refrigerators", "Washers & Dryers", "Dishwashers", "Ovens & Ranges", "Small Appliances"],
  "Arts, Crafts & Sewing": ["Painting", "Drawing", "Sewing", "Knitting & Crochet", "Scrapbooking", "Beading"],
  "Automotive": ["Parts & Accessories", "Tools", "Car Care", "Motorcycle", "Truck & RV"],
  "Baby": ["Nursery", "Feeding", "Diapering", "Toys", "Clothing", "Safety", "Strollers"],
  "Beauty & Personal Care": ["Skincare", "Makeup", "Hair Care", "Fragrance", "Personal Care", "Professional Beauty"],
  "Books": ["Fiction", "Non-Fiction", "Children's", "Textbooks", "Comics & Graphic Novels"],
  "Camera & Photo": ["Digital Cameras", "Lenses", "Tripods & Accessories", "Lighting", "Bags & Cases", "Video"],
  "CDs & Vinyl": ["Rock", "Pop", "Hip-Hop", "Classical", "Jazz", "Country", "Vinyl Records"],
  "Cell Phones & Accessories": ["Cases & Covers", "Screen Protectors", "Chargers & Cables", "Headsets", "Smartwatches"],
  "Clothing, Shoes & Jewelry": ["Men", "Women", "Boys", "Girls", "Baby", "Jewelry"],
  "Collectibles & Fine Art": ["Coins", "Stamps", "Sports Memorabilia", "Art Prints", "Antiques"],
  "Computers & Accessories": ["Laptops", "Desktops", "Monitors", "Components", "Networking", "Accessories"],
  "Electronics": ["TV & Video", "Audio & Home Theater", "Cameras", "Headphones", "Smart Home", "Wearables", "Accessories"],
  "Grocery & Gourmet Food": ["Beverages", "Snacks", "Pantry Staples", "Organic", "International Foods", "Candy"],
  "Health & Household": ["Vitamins & Supplements", "Household Supplies", "Health Care", "Baby & Child Care", "Personal Care"],
  "Home & Kitchen": ["Kitchen & Dining", "Bedding", "Bath", "Furniture", "Storage & Organization", "Lighting", "Décor"],
  "Industrial & Scientific": ["Lab Supplies", "Safety", "Janitorial", "Electrical", "Fasteners", "Test & Measurement"],
  "Luggage & Travel Gear": ["Suitcases", "Carry-Ons", "Backpacks", "Travel Accessories", "Duffel Bags"],
  "Movies & TV": ["New Releases", "Blu-ray", "DVD", "4K Ultra HD", "Box Sets", "Foreign Films"],
  "Musical Instruments": ["Guitars", "Keyboards & MIDI", "Drums", "Wind", "String", "Recording Equipment"],
  "Office Products": ["Office Supplies", "Printers & Ink", "Office Electronics", "Furniture", "School Supplies"],
  "Patio, Lawn & Garden": ["Gardening", "Outdoor Furniture", "Grills & Outdoor Cooking", "Lawn Mowers", "Plants & Seeds"],
  "Pet Supplies": ["Dogs", "Cats", "Fish & Aquatics", "Birds", "Small Animals", "Reptiles"],
  "Sports & Outdoors": ["Outdoor Recreation", "Team Sports", "Fitness & Exercise", "Golf", "Cycling", "Water Sports"],
  "Tools & Home Improvement": ["Power Tools", "Hand Tools", "Lighting & Ceiling Fans", "Plumbing", "Electrical", "Hardware"],
  "Toys & Games": ["Action Figures", "Building Toys (LEGO)", "Dolls", "Educational", "Outdoor & Sports", "Puzzles"],
  "Video Games": ["PlayStation", "Xbox", "Nintendo", "PC Games", "VR", "Accessories"],
  "Watches": ["Men's", "Women's", "Kids'", "Smart Watches", "Watch Accessories"],
  // UK/EU equivalents
  "Beauty": ["Skincare", "Makeup", "Hair Care", "Fragrance", "Personal Care"],
  "Clothing": ["Men", "Women", "Boys", "Girls", "Baby"],
  "DIY & Tools": ["Power Tools", "Hand Tools", "Plumbing", "Electrical", "Paint"],
  "Garden & Outdoors": ["Gardening", "Outdoor Furniture", "BBQ & Grills", "Lawn Mowers", "Plants"],
  "Grocery": ["Beverages", "Snacks", "Pantry", "Organic", "International"],
  "Health & Personal Care": ["Vitamins", "Health Care", "Personal Care", "Baby Care"],
  "Jewellery": ["Rings", "Necklaces", "Earrings", "Bracelets", "Wedding"],
  "Kitchen & Home": ["Cookware", "Bedding", "Bath", "Storage", "Lighting"],
  "PC & Video Games": ["PlayStation", "Xbox", "Nintendo", "PC", "Accessories"],
  "Stationery & Office Supplies": ["Pens & Pencils", "Paper", "Filing", "Desk Accessories", "School"],
};

/** Subcategories for a category; falls back to ["All"] if not in SUBCATEGORIES. */
export function getSubcategoriesForCategory(category: string): string[] {
  return SUBCATEGORIES[category] ?? ["All"];
}
