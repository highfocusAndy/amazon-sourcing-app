/**
 * Static category and subcategory list for Explorer. No API call—used in-app only.
 */

/** Top-level Amazon marketplace categories (US). */
export const TOP_LEVEL_CATEGORIES = [
  "Arts, Crafts & Sewing",
  "Automotive",
  "Baby",
  "Beauty & Personal Care",
  "Books",
  "Camera & Photo",
  "Cell Phones & Accessories",
  "Clothing, Shoes & Jewelry",
  "Collectible Currencies",
  "Computers & Accessories",
  "Electronics",
  "Garden & Outdoor",
  "Grocery & Gourmet Food",
  "Health & Household",
  "Home & Kitchen",
  "Industrial & Scientific",
  "Kindle Store",
  "Kitchen & Dining",
  "Musical Instruments",
  "Office Products",
  "Patio, Lawn & Garden",
  "Pet Supplies",
  "Software",
  "Sports & Outdoors",
  "Tools & Home Improvement",
  "Toys & Games",
  "Video Games",
];

/** Subcategories per top-level category. Categories not listed get a single "All" option. */
export const SUBCATEGORIES: Record<string, string[]> = {
  "Beauty & Personal Care": ["Skincare", "Makeup", "Hair Care", "Fragrance", "Personal Care", "Professional"],
  "Electronics": ["Computers", "TV & Video", "Camera & Photo", "Headphones", "Smart Home", "Accessories"],
  "Toys & Games": ["LEGO", "Action Figures", "Educational", "Outdoor Play", "Puzzles", "Video Games"],
  "Home & Kitchen": ["Kitchen & Dining", "Bedding", "Bath", "Furniture", "Storage", "Lighting"],
  "Sports & Outdoors": ["Outdoor Recreation", "Sports", "Fitness", "Fan Shop", "Golf", "Cycling"],
  "Health & Household": ["Vitamins", "Household", "Health Care", "Personal Care", "Baby Care"],
  "Clothing, Shoes & Jewelry": ["Men", "Women", "Kids", "Jewelry", "Watches", "Luggage"],
  "Books": ["Fiction", "Non-Fiction", "Children's", "Textbooks", "Kindle"],
  "Pet Supplies": ["Dogs", "Cats", "Fish", "Birds", "Small Animals", "Reptiles"],
  "Grocery & Gourmet Food": ["Beverages", "Snacks", "Pantry", "Organic", "International"],
  "Tools & Home Improvement": ["Power Tools", "Hand Tools", "Lighting", "Plumbing", "Electrical"],
  "Baby": ["Nursery", "Feeding", "Diapering", "Toys", "Clothing", "Safety"],
  "Office Products": ["Office Supplies", "Office Electronics", "Furniture", "School Supplies"],
  "Automotive": ["Parts", "Accessories", "Tools", "Care", "Motorcycle"],
  "Camera & Photo": ["Digital Cameras", "Lenses", "Accessories", "Lighting", "Bags"],
  "Cell Phones & Accessories": ["Cases", "Screen Protectors", "Chargers", "Headsets", "Smart Watches"],
  "Computers & Accessories": ["Laptops", "Desktops", "Monitors", "Components", "Accessories"],
  "Video Games": ["Consoles", "Games", "Controllers", "VR", "Accessories"],
};

/** Subcategories for a category; falls back to ["All"] if not in SUBCATEGORIES. */
export function getSubcategoriesForCategory(category: string): string[] {
  return SUBCATEGORIES[category] ?? ["All"];
}
