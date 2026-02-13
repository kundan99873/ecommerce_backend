import type { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler.js";
import type { cartProduct } from "./types.js";
import { prisma } from "../../libs/prisma.js";
import { ApiError } from "../../utils/apiError.js";
import { ApiResponse } from "../../utils/apiResponse.js";

const addProductToCart = asyncHandler(
  async (req: Request, res: Response) => {
    const { slug: sku, quantity } = req.body as cartProduct

    const userId = req.user!.user_id;

    if (!sku || !quantity || quantity <= 0) {
      throw new ApiError(400, "SKU and valid quantity are required");
    }

    const variant = await prisma.productVariant.findUnique({
      where: { sku },
      include: {
        product: true,
      },
    });

    if (!variant) {
      throw new ApiError(404, "Product variant not found");
    }

    if (!variant.is_active) {
      throw new ApiError(400, "Variant is not active");
    }

    if (variant.stock < quantity) {
      throw new ApiError(400, "Insufficient stock");
    }

    const cart = await prisma.cart.upsert({
      where: { user_id: userId },
      update: {},
      create: {
        user_id: userId,
      },
    });

    const existingCartItem = await prisma.cartItem.findUnique({
      where: {
        cart_id_product_variant_id: {
          cart_id: cart.id,
          product_variant_id: variant.id,
        },
      },
    });

    let cartItem;

    if (existingCartItem) {
      const newQuantity = existingCartItem.quantity + quantity;

      if (variant.stock < newQuantity) {
        throw new ApiError(400, "Insufficient stock");
      }

      cartItem = await prisma.cartItem.update({
        where: { id: existingCartItem.id },
        data: {
          quantity: newQuantity,
        },
      });
    } else {
      cartItem = await prisma.cartItem.create({
        data: {
          cart_id: cart.id,
          product_variant_id: variant.id,
          quantity,
          price: variant.discounted_price,
        },
      });
    }

    return res
      .status(200)
      .json(new ApiResponse("Product added to cart successfully", cartItem));
  },
);

const getCartProducts = asyncHandler(async(req: Request, res: Response) => {
  const userId = req.user!.user_id;

  const getCarts = await prisma.cart.findUnique({
    where: { user_id: userId},
    include: {
      items: {
        include: {
          product_variant: {
            include: {
              product: true
            }
          }
        }
      }
    }
  })

  return res.status(200).json(new ApiResponse("Cart item retrived successfully...", getCarts))
})

const updateCartItem = asyncHandler(
  async (req: Request, res: Response): Promise<Response> => {
    const userId = req.user!.user_id;
    const { sku, quantity } = req.body as { sku: string; quantity: number };

    if (!sku || quantity == null) {
      throw new ApiError(400, "SKU and quantity are required");
    }

    if (quantity < 0) {
      throw new ApiError(400, "Quantity must be zero or greater");
    }

    const cart = await prisma.cart.findUnique({
      where: { user_id: userId },
    });

    if (!cart) {
      throw new ApiError(404, "Cart not found");
    }

    const variant = await prisma.productVariant.findUnique({
      where: { sku },
    });

    if (!variant) {
      throw new ApiError(404, "Product variant not found");
    }

    const cartItem = await prisma.cartItem.findUnique({
      where: {
        cart_id_product_variant_id: {
          cart_id: cart.id,
          product_variant_id: variant.id,
        },
      },
    });

    if (!cartItem) {
      throw new ApiError(404, "Cart item not found");
    }

    if (quantity === 0) {
      await prisma.cartItem.delete({ where: { id: cartItem.id } });
      return res
        .status(200)
        .json(new ApiResponse("Cart item removed successfully"));
    }

    if (quantity > variant.stock) {
      throw new ApiError(400, "Quantity exceeds available stock");
    }

    const updatedCartItem = await prisma.cartItem.update({
      where: { id: cartItem.id },
      data: { quantity },
    });

    return res
      .status(200)
      .json(new ApiResponse("Cart item updated successfully", updatedCartItem));
  },
);

const deleteProductFromCart = asyncHandler(
  async (req: Request, res: Response): Promise<Response> => {
    const { slug: sku } = req.params as { slug: string };
    const userId = req.user!.user_id;

    if (!sku) {
      throw new ApiError(400, "SKU is required");
    }

    const variant = await prisma.productVariant.findUnique({
      where: { sku },
      include: {
        product: true,
      },
    });

    if (!variant) {
      throw new ApiError(404, "Product variant not found");
    }

    const cart = await prisma.cart.findUnique({
      where: { user_id: userId },
    });

    if (!cart) {
      throw new ApiError(404, "Cart not found");
    }

    const existingCartItem = await prisma.cartItem.findUnique({
      where: {
        cart_id_product_variant_id: {
          cart_id: cart.id,
          product_variant_id: variant.id,
        },

      },
    });

    if (!existingCartItem) {
      throw new ApiError(404, "Product not found in cart");
    }

    await prisma.cartItem.delete({
      where: { id: existingCartItem.id },
    });

    return res
      .status(200)
      .json(new ApiResponse("Product removed from cart successfully", null));
  },
);


export { addProductToCart, getCartProducts, updateCartItem, deleteProductFromCart };
