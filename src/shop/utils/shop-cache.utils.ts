import { RedisService } from '../../redis/redis.service';

export const SHOP_CATALOG_CACHE_TTL_SECONDS = 300;

export const SHOP_CATEGORIES_PUBLIC_CACHE_KEY = 'shop:categories:public';

export function shopProductsListCacheKey(query: unknown): string {
  return `shop:products:list:${JSON.stringify(query)}`;
}

export function shopProductOneCacheKey(productId: string): string {
  return `shop:products:one:${productId}`;
}

export async function invalidateShopCatalogCache(
  redis: RedisService,
  options?: { productId?: string },
): Promise<void> {
  const tasks: Promise<void>[] = [
    redis.delByPattern('shop:products:list:*'),
    redis.del(SHOP_CATEGORIES_PUBLIC_CACHE_KEY),
  ];

  if (options?.productId) {
    tasks.push(redis.del(shopProductOneCacheKey(options.productId)));
  } else {
    tasks.push(redis.delByPattern('shop:products:one:*'));
  }

  await Promise.all(tasks);
}