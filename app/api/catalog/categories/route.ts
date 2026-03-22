import { NextResponse } from "next/server";
import { TOP_LEVEL_CATEGORIES, SUBCATEGORIES } from "@/lib/catalogCategories";

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({
    categories: TOP_LEVEL_CATEGORIES,
    subcategories: SUBCATEGORIES,
  });
}
