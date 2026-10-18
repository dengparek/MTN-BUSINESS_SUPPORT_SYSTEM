import { db } from "../../config/db.js";
import { products } from "../../database/schema.js";
import { eq, and, desc, sql, ilike, or } from "drizzle-orm";
import type {
  CreateProductInput,
  Product,
  ProductQueryOptions,
  UpdateProductInput,
} from "../../types/index.js";

export class ProductService {
  static async createProduct(data: CreateProductInput) {
    const [newProduct] = await db.insert(products).values(data).returning();

    if (!newProduct) {
      throw new Error("Failed to create product record.");
    }
    return newProduct;
  }

  static async getAllProducts(options: ProductQueryOptions = {}) {
    const page = options.page && options.page > 0 ? options.page : 1;
    const limit = options.limit && options.limit > 0 ? options.limit : 20;
    const offset = (page - 1) * limit;

    const conditions = [];

    // Filter by category if provided
    if (options.category) {
      conditions.push(eq(products.category, options.category));
    }

    // Filter by status if provided
    if (options.status) {
      conditions.push(eq(products.status, options.status));
    }

    // Search by name or product code (case-insensitive)
    if (options.search) {
      conditions.push(
        or(
          ilike(products.name, `%${options.search}%`),
          ilike(products.code, `%${options.search}%`),
        ),
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Fetch the paginated items and the total matching count concurrently
    const [items, countResults] = await Promise.all([
      db
        .select()
        .from(products)
        .where(whereClause)
        .limit(limit)
        .offset(offset)
        .orderBy(desc(products.createdAt)),
      db
        .select({ count: sql<number>`count(*)` })
        .from(products)
        .where(whereClause),
    ]);

    const totalRecords = Number(countResults[0]?.count ?? 0);

    return {
      items,
      pagination: {
        total: totalRecords,
        page,
        limit,
        totalPages: Math.ceil(totalRecords / limit),
      },
    };
  }
  static async getProductById(id: string) {
    const [product] = await db
      .select()
      .from(products)
      .where(eq(products.id, id))
      .limit(1);
    return product || null;
  }

  static async updateProduct(id: string, data: UpdateProductInput) {
    const [updated] = await db
      .update(products)
      .set(data)
      .where(eq(products.id, id))
      .returning();
    return updated || null;
  }

  static async updateProductStatus(id: string, status: "ACTIVE" | "RETIRED") {
    const [updatedProduct] = await db
      .update(products)
      .set({ status })
      .where(eq(products.id, id))
      .returning();

    if (!updatedProduct) {
      throw new Error("Product not found.");
    }

    return updatedProduct;
  }
}
