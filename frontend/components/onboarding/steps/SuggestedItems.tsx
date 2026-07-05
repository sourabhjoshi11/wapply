'use client';

import { useState, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronUp, Check, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { SeedProduct, SeedService, SeedAsset } from '@/lib/seedData';

type SeedItem = SeedProduct | SeedService | SeedAsset;
type SuggestionType = 'product' | 'service' | 'asset';

interface SuggestedItemsProps<T extends SeedItem> {
  items: T[];
  onConfirm: (selected: T[]) => void;
  type: SuggestionType;
  existingNames: Set<string>; // names already in store — deduplicate
}

export default function SuggestedItems<T extends SeedItem>({
  items,
  onConfirm,
  type,
  existingNames,
}: SuggestedItemsProps<T>) {
  // Pre-check all items that don't already exist in the catalog
  const initialChecked = useMemo(() => {
    const map: Record<number, boolean> = {};
    items.forEach((item, i) => {
      map[i] = !existingNames.has(item.name);
    });
    return map;
  }, [items, existingNames]);

  // Editable prices — start at seed defaults
  const initialPrices = useMemo(() => {
    const map: Record<number, number> = {};
    items.forEach((item, i) => {
      if ('price_per_hour' in item) {
        map[i] = item.price_per_hour;
      } else {
        map[i] = item.price;
      }
    });
    return map;
  }, [items]);

  // Editable durations — start at seed defaults (services only)
  const initialDurations = useMemo(() => {
    const map: Record<number, number> = {};
    items.forEach((item, i) => {
      if ('duration' in item) {
        map[i] = item.duration;
      }
    });
    return map;
  }, [items]);

  const [checked, setChecked] = useState<Record<number, boolean>>(initialChecked);
  const [prices, setPrices] = useState<Record<number, number>>(initialPrices);
  const [durations, setDurations] = useState<Record<number, number>>(initialDurations);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [searchQuery, setSearchQuery] = useState('');

  // Group by category
  const grouped = useMemo(() => {
    const map: Record<string, SeedItem[]> = {};
    items.forEach((item, i) => {
      const cat = 'category' in item && item.category ? item.category : 'Other';
      if (!map[cat]) map[cat] = [];
      map[cat].push(item);
    });
    return map;
  }, [items]);

  // Filter by search query
  const filteredGrouped = useMemo(() => {
    if (!searchQuery.trim()) return grouped;
    const q = searchQuery.toLowerCase();
    const result: Record<string, SeedItem[]> = {};
    for (const [cat, catItems] of Object.entries(grouped)) {
      const filtered = catItems.filter(
        (item) =>
          item.name.toLowerCase().includes(q) ||
          cat.toLowerCase().includes(q),
      );
      if (filtered.length > 0) {
        result[cat] = filtered;
      }
    }
    return result;
  }, [grouped, searchQuery]);

  const selectedCount = Object.values(checked).filter(Boolean).length;
  const totalCount = items.length;
  const allSelected = selectedCount === totalCount;

  const toggleAll = useCallback(() => {
    if (allSelected) {
      setChecked({});
    } else {
      const all: Record<number, boolean> = {};
      items.forEach((_, i) => {
        all[i] = true;
      });
      setChecked(all);
    }
  }, [allSelected, items]);

  const toggleCollapse = useCallback((cat: string) => {
    setCollapsed((prev) => ({ ...prev, [cat]: !prev[cat] }));
  }, []);

  // Find global index for a seed item
  const findIndex = useCallback(
    (item: SeedItem) => items.findIndex((s) => s.name === item.name),
    [items],
  );

  const handlePriceChange = useCallback(
    (index: number, value: string) => {
      const num = parseFloat(value);
      if (!isNaN(num) && num >= 0) {
        setPrices((prev) => ({ ...prev, [index]: num }));
      } else if (value === '') {
        // Allow clearing — will fall back to seed on confirm
        setPrices((prev) => ({ ...prev, [index]: 0 }));
      }
    },
    [],
  );

  const handleDurationChange = useCallback(
    (index: number, value: string) => {
      const num = parseInt(value, 10);
      if (!isNaN(num) && num > 0) {
        setDurations((prev) => ({ ...prev, [index]: num }));
      }
    },
    [],
  );

  const handleConfirm = useCallback(() => {
    const selected = items.filter((_, i) => checked[i]);
    const withEdits = selected.map((item) => {
      const idx = findIndex(item);
      if ('price_per_hour' in item) {
        const a = item as SeedAsset;
        return {
          ...a,
          price_per_hour: prices[idx] || a.price_per_hour,
        } as SeedAsset;
      }
      if ('duration' in item) {
        const s = item as SeedService;
        return {
          ...s,
          price: prices[idx] || s.price,
          duration: durations[idx] || s.duration,
        } as SeedService;
      }
      const p = item as SeedProduct;
      return {
        ...p,
        price: prices[idx] || p.price,
      } as SeedProduct;
    });
    onConfirm(withEdits as T[]);
  }, [items, checked, prices, durations, findIndex, onConfirm]);

  const isService = type === 'service';
  const isAsset = type === 'asset';

  // Determine which items match a given category for index lookup
  const getCategoryIndices = useCallback(
    (catItems: SeedItem[]) => {
      return catItems.map((item) => findIndex(item));
    },
    [findIndex],
  );

  return (
    <div className="space-y-4">
      {/* Header bar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-400">
            {selectedCount} of {totalCount} selected
          </span>
          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-[#25D366]/10 text-[#25D366]">
            {allSelected ? 'All selected' : `${selectedCount}/${totalCount}`}
          </span>
        </div>
        <button
          onClick={toggleAll}
          className="text-sm text-[#25D366] hover:text-[#1da851] transition-colors font-medium"
        >
          {allSelected ? 'Deselect All' : 'Select All'}
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
        <input
          type="text"
          placeholder="Search items..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-9 pr-3 py-2 rounded-lg bg-gray-800/50 border border-gray-700 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-[#25D366]/50 transition-colors"
        />
      </div>

      {/* Category groups */}
      <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
        {Object.entries(filteredGrouped).map(([cat, catItems]) => {
          const indices = getCategoryIndices(catItems);
          const catAllChecked = indices.every((i) => checked[i]);
          const catSomeChecked = indices.some((i) => checked[i]);
          const isCollapsed = collapsed[cat];

          return (
            <div
              key={cat}
              className="rounded-lg border border-gray-800 bg-gray-900/40 overflow-hidden"
            >
              {/* Category header */}
              <button
                onClick={() => toggleCollapse(cat)}
                className="w-full flex items-center justify-between px-3 py-2.5 bg-gray-900/60 hover:bg-gray-800/60 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`text-sm font-semibold ${
                      catAllChecked
                        ? 'text-white'
                        : catSomeChecked
                          ? 'text-gray-200'
                          : 'text-gray-400'
                    }`}
                  >
                    {cat}
                  </span>
                  <span className="text-xs text-gray-500">
                    ({catItems.length})
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div
                    onClick={(e) => {
                      e.stopPropagation();
                      const newChecked = { ...checked };
                      for (const idx of indices) {
                        newChecked[idx] = !catAllChecked;
                      }
                      setChecked(newChecked);
                    }}
                    className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all cursor-pointer ${
                      catAllChecked
                        ? 'bg-[#25D366] border-[#25D366]'
                        : catSomeChecked
                          ? 'border-[#25D366]/60 bg-[#25D366]/20'
                          : 'border-gray-600 hover:border-gray-500'
                    }`}
                  >
                    {catAllChecked && <Check className="h-3 w-3 text-white" />}
                    {catSomeChecked && !catAllChecked && (
                      <span className="h-2 w-2 rounded-sm bg-[#25D366]" />
                    )}
                  </div>
                  {isCollapsed ? (
                    <ChevronDown className="h-4 w-4 text-gray-500" />
                  ) : (
                    <ChevronUp className="h-4 w-4 text-gray-500" />
                  )}
                </div>
              </button>

              {/* Items */}
              <AnimatePresence initial={false}>
                {!isCollapsed && (
                  <motion.div
                    key="items"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="divide-y divide-gray-800/50">
                      {catItems.map((item) => {
                        const idx = findIndex(item);
                        const isChecked = checked[idx] ?? false;
                        const price = prices[idx];
                        const showPrice = price ?? (item as SeedProduct).price;
                        const isExisting = existingNames.has(item.name);

                        return (
                          <div
                            key={item.name}
                            className={`flex items-center gap-3 px-3 py-2.5 transition-colors ${
                              isChecked
                                ? 'bg-gray-800/20'
                                : 'hover:bg-gray-800/10'
                            } ${isExisting ? 'opacity-50 pointer-events-none' : ''}`}
                          >
                            {/* Checkbox */}
                            <div
                              onClick={() => {
                                if (isExisting) return;
                                setChecked((prev) => ({
                                  ...prev,
                                  [idx]: !prev[idx],
                                }));
                              }}
                              className={`flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-all cursor-pointer ${
                                isChecked
                                  ? 'bg-[#25D366] border-[#25D366]'
                                  : 'border-gray-600 hover:border-gray-500'
                              }`}
                            >
                              {isChecked && (
                                <Check className="h-3 w-3 text-white" />
                              )}
                            </div>

                            {/* Name */}
                            <span className="flex-1 text-sm font-medium text-white truncate">
                              {item.name}
                            </span>

                            {/* Duration badge (services only) */}
                            {isService && 'duration' in item && (
                              <div className="flex items-center gap-1">
                                <input
                                  type="number"
                                  min={1}
                                  max={999}
                                  value={durations[idx] ?? item.duration}
                                  onChange={(e) =>
                                    handleDurationChange(idx, e.target.value)
                                  }
                                  onClick={(e) => e.stopPropagation()}
                                  className="w-14 text-right text-xs bg-transparent border border-gray-700 rounded px-1 py-0.5 text-gray-300 focus:outline-none focus:border-[#25D366]/50 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                />
                                <span className="text-xs text-gray-500 flex-shrink-0">
                                  min
                                </span>
                              </div>
                            )}

                            {/* Price input */}
                            <div className="flex items-center gap-0.5">
                              <span className="text-xs text-gray-500">₹</span>
                              <input
                                type="number"
                                min={0}
                                step={isAsset ? 100 : 1}
                                value={showPrice}
                                onChange={(e) =>
                                  handlePriceChange(idx, e.target.value)
                                }
                                onClick={(e) => e.stopPropagation()}
                                className="w-16 text-right text-sm bg-transparent border border-gray-700 rounded px-1 py-0.5 text-white font-medium focus:outline-none focus:border-[#25D366]/50 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                              />
                            </div>

                            {/* Already exists badge */}
                            {isExisting && (
                              <span className="text-xs text-gray-500 flex-shrink-0">
                                Added
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}

        {Object.keys(filteredGrouped).length === 0 && (
          <p className="text-gray-500 text-center py-8 text-sm">
            No items match your search
          </p>
        )}
      </div>

      {/* Confirm button */}
      <Button
        onClick={handleConfirm}
        disabled={selectedCount === 0}
        className="w-full"
        size="lg"
      >
        Add Selected to Catalog ({selectedCount})
      </Button>
    </div>
  );
}
