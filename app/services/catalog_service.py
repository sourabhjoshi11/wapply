"""Service for managing the product catalog."""

from __future__ import annotations

from typing import Any
from uuid import UUID

from app.database import supabase
from app.utils.logger import setup_logger

logger = setup_logger(__name__)


class CatalogService:
    """CRUD and query operations for products."""

    TABLE = "products"

    async def get_categories(self, shop_id: UUID) -> list[str]:
        """Return distinct product categories for a shop.

        Args:
            shop_id: The shop's UUID.

        Returns:
            Sorted list of category strings.
        """
        try:
            result = (
                supabase.table(self.TABLE)
                .select("category")
                .eq("shop_id", str(shop_id))
                .eq("available", True)
                .neq("category", None)
                .execute()
            )
            categories: set[str] = set()
            for row in result.data:
                if row.get("category"):
                    categories.add(row["category"])
            return sorted(categories)
        except Exception as exc:
            logger.error(
                "Failed to fetch categories",
                extra={"shop_id": str(shop_id), "error": str(exc)},
            )
            return []

    async def get_products_by_category(
        self, shop_id: UUID, category: str
    ) -> list[dict[str, Any]]:
        """Return available products for a given category.

        Args:
            shop_id: The shop's UUID.
            category: Product category name.

        Returns:
            List of product dicts.
        """
        try:
            result = (
                supabase.table(self.TABLE)
                .select("*")
                .eq("shop_id", str(shop_id))
                .eq("category", category)
                .eq("available", True)
                .order("name")
                .execute()
            )
            return result.data
        except Exception as exc:
            logger.error(
                "Failed to fetch products by category",
                extra={
                    "shop_id": str(shop_id),
                    "category": category,
                    "error": str(exc),
                },
            )
            return []

    async def get_product_by_id(
        self, product_id: UUID
    ) -> dict[str, Any] | None:
        """Return a single product by its UUID.

        Args:
            product_id: Product UUID.

        Returns:
            Product dict or None.
        """
        try:
            result = (
                supabase.table(self.TABLE)
                .select("*")
                .eq("id", str(product_id))
                .single()
                .execute()
            )
            return result.data
        except Exception as exc:
            logger.error(
                "Failed to fetch product",
                extra={"product_id": str(product_id), "error": str(exc)},
            )
            return None

    async def upsert_product(
        self,
        shop_id: UUID,
        name: str,
        price: float,
        category: str | None = None,
        image_url: str | None = None,
        available: bool = True,
    ) -> dict[str, Any] | None:
        """Insert or update a product matched by (shop_id, name).

        Args:
            shop_id: The shop's UUID.
            name: Product name.
            price: Product price.
            category: Product category (optional).
            image_url: Public URL of product image (optional).
            available: Whether the product is available.

        Returns:
            Upserted product dict or None on failure.
        """
        try:
            payload = {
                "shop_id": str(shop_id),
                "name": name,
                "price": price,
                "category": category,
                "image_url": image_url,
                "available": available,
            }
            result = (
                supabase.table(self.TABLE)
                .upsert(payload, on_conflict="shop_id,name")
                .execute()
            )
            logger.info(
                "Product upserted",
                extra={
                    "shop_id": str(shop_id),
                    "name": name,
                    "price": price,
                },
            )
            return result.data[0] if result.data else None
        except Exception as exc:
            logger.error(
                "Failed to upsert product",
                extra={
                    "shop_id": str(shop_id),
                    "name": name,
                    "error": str(exc),
                },
            )
            return None

    async def get_all_available(self, shop_id: UUID) -> list[dict[str, Any]]:
        """Return all available products for a shop, ordered by category then name.

        Args:
            shop_id: The shop's UUID.

        Returns:
            List of product dicts.
        """
        try:
            result = (
                supabase.table(self.TABLE)
                .select("*")
                .eq("shop_id", str(shop_id))
                .eq("available", True)
                .order("category")
                .order("name")
                .execute()
            )
            return result.data
        except Exception as exc:
            logger.error(
                "Failed to fetch all products",
                extra={"shop_id": str(shop_id), "error": str(exc)},
            )
            return []
