import { getLanguage } from "./core.ts";
export const menuNames: Record<string, string> = {
  "Mercimek Çorbası": "Lentil soup",
  "Ezogelin Çorbası": "Ezogelin soup",
  "Tavuk Sote": "Sautéed chicken",
  "Kuru Fasulye": "White bean stew",
  Karnıyarık: "Stuffed aubergine",
  "Izgara Köfte": "Grilled meatballs",
  Pilav: "Rice pilaf",
  "Bulgur Pilavı": "Bulgur pilaf",
  "Çoban Salata": "Shepherd's salad",
  "Mevsim Salata": "Seasonal salad",
  Ayran: "Ayran (yogurt drink)",
  Kola: "Cola",
  Su: "Water",
  Sütlaç: "Rice pudding",
  Kazandibi: "Caramelized milk pudding",
};
export const categoryNames: Record<string, string> = {
  Çorba: "Soup",
  "Ana Yemek": "Main course",
  Yardımcı: "Side dish",
  Salata: "Salad",
  İçecek: "Drink",
  Tatlı: "Dessert",
};
export function productName(product: { name: string; nameEn?: string | null }) {
  return getLanguage() === "en"
    ? product.nameEn?.trim() || menuNames[product.name] || product.name
    : product.name;
}
export function receiptName(item: {
  productName: string;
  productNameEn?: string | null;
}) {
  return productName({ name: item.productName, nameEn: item.productNameEn });
}
export function categoryName(
  category: string,
  products: { category: string; categoryEn?: string | null }[] = [],
) {
  return getLanguage() === "en"
    ? products.find((p) => p.category === category && p.categoryEn)
        ?.categoryEn ||
        categoryNames[category] ||
        category
    : category;
}
