import type { Request, Response } from "express";
import { ProductService } from "./product.service.js";
import { db } from "../../config/db.js";
import { adminAuditLogs, products } from "../../database/schema.js";
import {
  VALID_CATEGORIES,
  VALID_STATUSES,
  type Product,
  type ValidCategory,
  type ValidStatus,
} from "../../types/index.js";
import { eq } from "drizzle-orm";

export class AdminProductController {
  static async createProduct(req: Request, res: Response) {
    try {
      const {
        code,
        name,
        category,
        allowance,
        unit,
        validitySeconds,
        priceMinor,
      } = req.body;
      const currentAdminId = req.user?.userId;

      if (
        !code ||
        !name ||
        !category ||
        allowance === undefined ||
        !unit ||
        validitySeconds === undefined ||
        priceMinor === undefined
      ) {
        return res.status(400).json({
          error:
            "All product fields (code, name, category, allowance, unit, validitySeconds, priceMinor) are required.",
        });
      }

      const productData = {
        code,
        name,
        category,
        allowance: Number(allowance),
        unit,
        validitySeconds: Number(validitySeconds),
        priceMinor: Number(priceMinor),
        status: "ACTIVE" as const,
      };

      // 1. Check if a product with this code already exists
      const existingProduct = await db
        .select()
        .from(products)
        .where(eq(products.code, productData.code))
        .limit(1);

      if (existingProduct.length > 0) {
        return res
          .status(500)
          .json(`A product with code "${productData.code}" already exists.`);
      }

      const newProduct = await ProductService.createProduct(productData);

      if (!newProduct) {
        throw new Error("Failed to create product record.");
      }

      if (currentAdminId) {
        await db.insert(adminAuditLogs).values({
          adminUserId: currentAdminId,
          action: "CREATE_PRODUCT",
          targetId: newProduct.id,
          details: `Admin created product bundle ${code} (${name})`,
          ipAddress: req.ip || null,
        });
      }

      const responseProduct = {
        ...newProduct,
        allowance: newProduct.allowance.toString(),
        priceMinor: newProduct.priceMinor.toString(),
      };

      return res.status(201).json({
        message: "Product created successfully.",
        data: responseProduct,
      });
    } catch (error: unknown) {
      console.error("Detailed Database Error:", JSON.stringify(error, null, 2));
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      console.error("Create Product Error:", errorMessage);
      return res
        .status(500)
        .json({ error: "Internal server error while creating product." });
    }
  }

  static async getProductById(req: Request, res: Response) {
    try {
      const rawId = req.params.id;
      const productId = Array.isArray(rawId) ? rawId[0] : rawId;
      if (!productId) {
        return res.status(400).json({ error: "Product ID is required." });
      }

      const product = await ProductService.getProductById(productId);
      if (!product) {
        return res.status(404).json({ error: "Product not found." });
      }

      return res.status(200).json({
        message: "Product retrieved successfully.",
        data: product,
      });
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      console.error("Get Product Error:", errorMessage);
      return res
        .status(500)
        .json({ error: "Internal server error while retrieving product." });
    }
  }

  static async listProducts(req: Request, res: Response) {
    try {
      const search =
        typeof req.query.search === "string" ? req.query.search : undefined;
      const category =
        typeof req.query.category === "string"
          ? (req.query.category.toUpperCase() as any)
          : undefined;
      const status =
        typeof req.query.status === "string"
          ? (req.query.status.toUpperCase() as any)
          : undefined;

      const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
      const limit = req.query.limit
        ? parseInt(req.query.limit as string, 10)
        : 20;

      const result = await ProductService.getAllProducts({
        search,
        category,
        status,
        page: isNaN(page) ? 1 : page,
        limit: isNaN(limit) ? 20 : limit,
      });

      return res.status(200).json({
        message: "Products retrieved successfully.",
        data: result.items,
        pagination: result.pagination,
      });
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      console.error("List Products Error:", errorMessage);
      return res
        .status(500)
        .json({ error: "Internal server error while retrieving products." });
    }
  }

  static async updateProduct(req: Request, res: Response) {
    try {
      const rawId = req.params.id;
      const productId = Array.isArray(rawId) ? rawId[0] : rawId;
      if (!productId) {
        return res.status(400).json({ error: "Product ID is required." });
      }

      const {
        name,
        category,
        allowance,
        unit,
        validitySeconds,
        priceMinor,
        status,
      } = req.body;
      const currentAdminId = req.user?.userId;

      const existing = await ProductService.getProductById(productId);
      if (!existing) {
        return res.status(404).json({ error: "Product not found." });
      }

      const updateData: Record<string, unknown> = {};
      if (name !== undefined) updateData.name = name;
      if (category !== undefined) updateData.category = category;
      if (allowance !== undefined) updateData.allowance = BigInt(allowance);
      if (unit !== undefined) updateData.unit = unit;
      if (validitySeconds !== undefined)
        updateData.validitySeconds = Number(validitySeconds);
      if (priceMinor !== undefined) updateData.priceMinor = BigInt(priceMinor);
      if (status !== undefined) updateData.status = status;

      const updatedProduct = await ProductService.updateProduct(
        productId,
        updateData,
      );

      if (currentAdminId && updatedProduct) {
        await db.insert(adminAuditLogs).values({
          adminUserId: currentAdminId,
          action: "UPDATE_PRODUCT",
          targetId: productId,
          details: `Admin updated product bundle ${updatedProduct.code}`,
          ipAddress: req.ip || null,
        });
      }

      return res.status(200).json({
        message: "Product updated successfully.",
        data: updatedProduct,
      });
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      console.error("Update Product Error:", errorMessage);
      return res
        .status(500)
        .json({ error: "Internal server error while updating product." });
    }
  }

  static async changeProductStatus(req: Request, res: Response) {
    try {
      const id = typeof req.params.id === "string" ? req.params.id : undefined;
      const { status } = req.body;

      if (!id) {
        return res.status(400).json({ error: "Product ID is required." });
      }

      if (!status || !["ACTIVE", "RETIRED"].includes(status.toUpperCase())) {
        return res.status(400).json({
          error: "Invalid status. Status must be either 'ACTIVE' or 'RETIRED'.",
        });
      }

      const updatedProduct = await ProductService.updateProductStatus(
        id,
        status.toUpperCase() as "ACTIVE" | "RETIRED",
      );

      return res.status(200).json({
        message: `Product successfully marked as ${updatedProduct.status}.`,
        data: updatedProduct,
      });
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      console.error("Change Status Error:", errorMessage);

      if (errorMessage === "Product not found.") {
        return res.status(404).json({ error: errorMessage });
      }

      return res.status(500).json({
        error: "Internal server error while updating product status.",
      });
    }
  }
}
