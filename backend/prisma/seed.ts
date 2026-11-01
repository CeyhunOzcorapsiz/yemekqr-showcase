import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
const prisma = new PrismaClient();
const TL = 100;
const englishNames:Record<string,string>={"Mercimek Çorbası":"Lentil soup","Ezogelin Çorbası":"Ezogelin soup","Tavuk Sote":"Sautéed chicken","Kuru Fasulye":"White bean stew","Karnıyarık":"Stuffed aubergine","Izgara Köfte":"Grilled meatballs","Pilav":"Rice pilaf","Bulgur Pilavı":"Bulgur pilaf","Çoban Salata":"Shepherd's salad","Mevsim Salata":"Seasonal salad","Ayran":"Ayran (yogurt drink)","Kola":"Cola","Su":"Water","Sütlaç":"Rice pudding","Kazandibi":"Caramelized milk pudding"};
const englishCategories:Record<string,string>={"Çorba":"Soup","Ana Yemek":"Main course","Yardımcı":"Side dish","Salata":"Salad","İçecek":"Drink","Tatlı":"Dessert"};
const sampleMenu = [
  { name: "Mercimek Çorbası", category: "Çorba", price: 60 * TL },
  { name: "Ezogelin Çorbası", category: "Çorba", price: 60 * TL },
  { name: "Tavuk Sote", category: "Ana Yemek", price: 150 * TL },
  { name: "Kuru Fasulye", category: "Ana Yemek", price: 120 * TL },
  { name: "Karnıyarık", category: "Ana Yemek", price: 140 * TL },
  { name: "Izgara Köfte", category: "Ana Yemek", price: 160 * TL },
  { name: "Pilav", category: "Yardımcı", price: 50 * TL },
  { name: "Bulgur Pilavı", category: "Yardımcı", price: 45 * TL },
  { name: "Çoban Salata", category: "Salata", price: 55 * TL },
  { name: "Mevsim Salata", category: "Salata", price: 55 * TL },
  { name: "Ayran", category: "İçecek", price: 25 * TL },
  { name: "Kola", category: "İçecek", price: 40 * TL },
  { name: "Su", category: "İçecek", price: 15 * TL },
  { name: "Sütlaç", category: "Tatlı", price: 65 * TL },
  { name: "Kazandibi", category: "Tatlı", price: 70 * TL },
];


async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("Production ortamında demo seed çalıştırılamaz.");
  const restaurantId = "00000000-0000-4000-8000-000000000001";
  const passwordHash = await bcrypt.hash("demo1234",12);
  await prisma.$transaction(async tx => {
    await tx.restaurant.upsert({where:{id:restaurantId},update:{},create:{id:restaurantId,name:"Demo Esnaf Lokantası"}});
    for (const [email,name,role] of [["admin@demo.com","Demo Yönetici","admin"],["kasiyer@demo.com","Demo Kasiyer","kasiyer"]]) {
      const existing=await tx.user.findUnique({where:{email}});
      if(existing && existing.restaurantId !== restaurantId)throw new Error("Demo e-postası başka restoranda kullanılıyor; mevcut hesap değiştirilmedi.");
      await tx.user.upsert({where:{email},update:{},create:{restaurantId,name,email,role,passwordHash}});
    }
    for(const [index,item] of sampleMenu.entries()) {
      const id="00000000-0000-4000-9000-"+String(index+1).padStart(12,"0");
      await tx.product.upsert({where:{id},update:{},create:{id,restaurantId,...item,nameEn:englishNames[item.name],categoryEn:englishCategories[item.category]}});
    }
  });
  console.log("Demo hazır: admin@demo.com / kasiyer@demo.com · demo1234. Mevcut düzenlemeler korunur.");
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>prisma.$disconnect());
