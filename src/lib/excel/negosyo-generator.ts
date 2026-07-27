import "server-only";
import ExcelJS from "exceljs";
import { getCategory } from "./category-config";
import { protectAllSheets } from "./style-kit";
import { buildBaseWorkbook } from "./templates/base";
import { buildAirbnbWorkbook } from "./templates/airbnb";
import { buildBarbershopWorkbook } from "./templates/barbershop";
import { buildCarWashWorkbook } from "./templates/carwash";
import { buildRentalWorkbook } from "./templates/rental";
import { buildPandesalWorkbook } from "./templates/pandesal";

/**
 * Fixed branding (Negosyo Tracker PH logo, per-category palette baked into
 * each template) — no user-supplied logo or colors. This is a deliberate
 * product simplification: v3 standardizes on one polished design per
 * category (reverse-engineered from real reference files) rather than
 * letting a customer's own color choice clash with it.
 */
export interface NegosyoTrackerData {
  businessName: string;
  category: string;
  products: string[];
  mayUtang: boolean;
}

export async function generateNegosyoExcel(data: NegosyoTrackerData): Promise<Buffer> {
  const category = getCategory(data.category);
  const businessName = data.businessName.trim().slice(0, 80) || "Aking Negosyo";
  const products = data.products.map((p) => p.trim()).filter(Boolean).slice(0, 20);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Negosyo Tracker PH — by Axla";
  workbook.created = new Date();

  const templateData = { businessName, category, products, mayUtang: data.mayUtang };

  switch (category.template) {
    case "airbnb":
      await buildAirbnbWorkbook(workbook, templateData);
      break;
    case "barbershop":
      await buildBarbershopWorkbook(workbook, templateData);
      break;
    case "carwash":
      await buildCarWashWorkbook(workbook, templateData);
      break;
    case "rental":
      await buildRentalWorkbook(workbook, templateData);
      break;
    case "pandesal":
      await buildPandesalWorkbook(workbook, templateData);
      break;
    case "base":
    default:
      await buildBaseWorkbook(workbook, templateData);
      break;
  }

  await protectAllSheets(workbook);

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}
