// Pre-seeded product/service/asset data for each business type
// Used during onboarding to pre-populate catalogs so owners can
// review/edit/confirm instead of typing everything from scratch.

export type SeedProduct = {
  name: string;
  price: number;
  category: string;
};

export type SeedService = {
  name: string;
  price: number;
  duration: number; // minutes
  category: string;
};

export type SeedAsset = {
  name: string;
  price_per_hour: number;
  category: string;
};

// ── Kirana / General Shop ───────────────────────────────

export const SHOP_SEED_DATA: SeedProduct[] = [
  // Snacks
  { name: 'Parle-G Biscuit 100g', price: 10, category: 'Snacks' },
  { name: 'Maggi Noodles 70g', price: 14, category: 'Snacks' },
  { name: 'Lays Chips Classic 26g', price: 20, category: 'Snacks' },
  { name: 'Monaco Biscuit', price: 20, category: 'Snacks' },
  { name: 'Kurkure Masala Munch', price: 20, category: 'Snacks' },
  // Beverages
  { name: 'Coca-Cola 250ml', price: 20, category: 'Beverages' },
  { name: 'Pepsi 250ml', price: 20, category: 'Beverages' },
  { name: 'Frooti 200ml', price: 15, category: 'Beverages' },
  { name: 'Sprite 250ml', price: 20, category: 'Beverages' },
  { name: 'Red Bull 250ml', price: 115, category: 'Beverages' },
  // Dairy
  { name: 'Amul Milk 500ml', price: 26, category: 'Dairy' },
  { name: 'Amul Butter 100g', price: 56, category: 'Dairy' },
  { name: 'Amul Paneer 200g', price: 80, category: 'Dairy' },
  { name: 'Nestle Dahi 400g', price: 46, category: 'Dairy' },
  { name: 'Amul Cheese Slice 200g', price: 95, category: 'Dairy' },
  // Groceries
  { name: 'Aashirvaad Atta 5kg', price: 215, category: 'Groceries' },
  { name: 'India Gate Basmati Rice 1kg', price: 90, category: 'Groceries' },
  { name: 'Fortune Sunflower Oil 1L', price: 130, category: 'Groceries' },
  { name: 'Tata Salt 1kg', price: 20, category: 'Groceries' },
  { name: 'Surf Excel 1kg', price: 180, category: 'Groceries' },
  // Household
  { name: 'Colgate Toothpaste 100g', price: 55, category: 'Household' },
  { name: 'Dettol Soap 75g', price: 35, category: 'Household' },
  { name: 'Vim Bar 200g', price: 30, category: 'Household' },
  { name: 'Harpic 500ml', price: 110, category: 'Household' },
  // Bakery
  { name: 'Britannia Brown Bread', price: 40, category: 'Bakery' },
  { name: 'Britannia White Bread', price: 35, category: 'Bakery' },
  { name: 'Cake Rusk 200g', price: 45, category: 'Bakery' },
  // Other
  { name: 'Hajmola Candy', price: 1, category: 'Other' },
  { name: 'Catch Masala 50g', price: 25, category: 'Other' },
  { name: 'Tata Tea Premium 250g', price: 95, category: 'Beverages' },
];

// ── Restaurant / Dhaba ──────────────────────────────────

export const RESTAURANT_SEED_DATA: SeedProduct[] = [
  // Starters
  { name: 'Paneer Tikka', price: 220, category: 'Starters' },
  { name: 'Veg Spring Roll (6 pcs)', price: 160, category: 'Starters' },
  { name: 'Chicken Tikka', price: 280, category: 'Starters' },
  { name: 'Hara Bhara Kabab', price: 180, category: 'Starters' },
  { name: 'Samosa (2 pcs)', price: 40, category: 'Starters' },
  // Main Course
  { name: 'Dal Fry', price: 120, category: 'Main Course' },
  { name: 'Dal Tadka', price: 130, category: 'Main Course' },
  { name: 'Paneer Butter Masala', price: 200, category: 'Main Course' },
  { name: 'Shahi Paneer', price: 220, category: 'Main Course' },
  { name: 'Palak Paneer', price: 190, category: 'Main Course' },
  { name: 'Kadai Paneer', price: 200, category: 'Main Course' },
  { name: 'Chicken Curry', price: 240, category: 'Main Course' },
  { name: 'Butter Chicken', price: 280, category: 'Main Course' },
  { name: 'Mutton Rogan Josh', price: 350, category: 'Main Course' },
  { name: 'Mix Veg', price: 160, category: 'Main Course' },
  // Breads
  { name: 'Butter Naan', price: 40, category: 'Breads' },
  { name: 'Plain Roti', price: 15, category: 'Breads' },
  { name: 'Tandoori Roti', price: 25, category: 'Breads' },
  { name: 'Garlic Naan', price: 50, category: 'Breads' },
  { name: 'Paratha', price: 45, category: 'Breads' },
  // Rice
  { name: 'Steamed Rice', price: 80, category: 'Rice' },
  { name: 'Jeera Rice', price: 100, category: 'Rice' },
  { name: 'Veg Biryani', price: 180, category: 'Rice' },
  { name: 'Chicken Biryani', price: 250, category: 'Rice' },
  // Beverages
  { name: 'Sweet Lassi', price: 60, category: 'Beverages' },
  { name: 'Masala Chaas', price: 40, category: 'Beverages' },
  { name: 'Mango Lassi', price: 80, category: 'Beverages' },
  { name: 'Soft Drink', price: 40, category: 'Beverages' },
  { name: 'Mineral Water', price: 20, category: 'Beverages' },
  // Desserts
  { name: 'Gulab Jamun (2 pcs)', price: 60, category: 'Desserts' },
  { name: 'Kulfi', price: 80, category: 'Desserts' },
  { name: 'Raita', price: 50, category: 'Desserts' },
];

// ── Salon / Beauty Parlour ──────────────────────────────

export const SALON_SEED_DATA: SeedService[] = [
  // Hair (Men)
  { name: 'Haircut (Men)', price: 150, duration: 30, category: 'Hair (Men)' },
  { name: 'Hair Trim (Men)', price: 100, duration: 20, category: 'Hair (Men)' },
  { name: 'Beard Trim', price: 80, duration: 15, category: 'Hair (Men)' },
  { name: 'Clean Shave', price: 100, duration: 20, category: 'Hair (Men)' },
  { name: 'Hair + Beard Combo', price: 200, duration: 45, category: 'Hair (Men)' },
  // Hair (Women)
  { name: 'Haircut (Women)', price: 300, duration: 45, category: 'Hair (Women)' },
  { name: 'Hair Wash & Blow Dry', price: 250, duration: 45, category: 'Hair (Women)' },
  { name: 'Hair Straightening', price: 800, duration: 120, category: 'Hair (Women)' },
  { name: 'Hair Coloring', price: 1200, duration: 120, category: 'Hair (Women)' },
  { name: 'Keratin Treatment', price: 2500, duration: 180, category: 'Hair (Women)' },
  // Facial
  { name: 'Basic Facial', price: 400, duration: 45, category: 'Facial' },
  { name: 'Gold Facial', price: 800, duration: 60, category: 'Facial' },
  { name: 'Diamond Facial', price: 1200, duration: 75, category: 'Facial' },
  { name: 'Cleanup', price: 250, duration: 30, category: 'Facial' },
  // Threading & Waxing
  { name: 'Eyebrow Threading', price: 30, duration: 10, category: 'Threading' },
  { name: 'Upper Lip Threading', price: 20, duration: 5, category: 'Threading' },
  { name: 'Full Face Threading', price: 80, duration: 20, category: 'Threading' },
  { name: 'Full Arm Waxing', price: 200, duration: 30, category: 'Waxing' },
  { name: 'Full Leg Waxing', price: 350, duration: 45, category: 'Waxing' },
  { name: 'Full Body Waxing', price: 800, duration: 90, category: 'Waxing' },
  // Nails
  { name: 'Manicure', price: 350, duration: 45, category: 'Nails' },
  { name: 'Pedicure', price: 450, duration: 60, category: 'Nails' },
  { name: 'Nail Art (per nail)', price: 50, duration: 5, category: 'Nails' },
];

// ── Turf / Sports Facility ──────────────────────────────

export const TURF_SEED_DATA: SeedAsset[] = [
  { name: 'Football Turf (Full)', price_per_hour: 1500, category: 'Football' },
  { name: 'Football Turf (Half)', price_per_hour: 800, category: 'Football' },
  { name: 'Cricket Net Lane 1', price_per_hour: 500, category: 'Cricket' },
  { name: 'Cricket Net Lane 2', price_per_hour: 500, category: 'Cricket' },
  { name: 'Badminton Court 1', price_per_hour: 300, category: 'Badminton' },
  { name: 'Badminton Court 2', price_per_hour: 300, category: 'Badminton' },
  { name: 'Box Cricket (Full)', price_per_hour: 1200, category: 'Cricket' },
];

// ── Boutique / Fashion ──────────────────────────────────

export const BOUTIQUE_SEED_DATA: SeedProduct[] = [
  // Kurtis
  { name: 'Cotton Kurti (S)', price: 299, category: 'Kurtis' },
  { name: 'Cotton Kurti (M)', price: 299, category: 'Kurtis' },
  { name: 'Cotton Kurti (L)', price: 299, category: 'Kurtis' },
  { name: 'Cotton Kurti (XL)', price: 349, category: 'Kurtis' },
  { name: 'Rayon Kurti Printed', price: 399, category: 'Kurtis' },
  { name: 'Embroidered Kurti', price: 599, category: 'Kurtis' },
  // Suits & Dress Material
  { name: 'Salwar Suit Set', price: 799, category: 'Suits' },
  { name: 'Punjabi Suit Set', price: 899, category: 'Suits' },
  { name: 'Churidar Suit Set', price: 999, category: 'Suits' },
  { name: 'Dress Material (Unstitched)', price: 450, category: 'Suits' },
  // Sarees
  { name: 'Cotton Saree', price: 499, category: 'Sarees' },
  { name: 'Silk Saree', price: 1499, category: 'Sarees' },
  { name: 'Georgette Saree', price: 799, category: 'Sarees' },
  { name: 'Chiffon Saree', price: 699, category: 'Sarees' },
  // Lehengas
  { name: 'Lehenga Choli Set', price: 1999, category: 'Lehengas' },
  { name: 'Bridal Lehenga', price: 4999, category: 'Lehengas' },
  { name: 'Party Lehenga', price: 2499, category: 'Lehengas' },
  // Men
  { name: 'Kurta Pajama Set (M)', price: 599, category: 'Mens Wear' },
  { name: 'Kurta Pajama Set (L)', price: 599, category: 'Mens Wear' },
  { name: 'Kurta Pajama Set (XL)', price: 649, category: 'Mens Wear' },
  { name: 'Sherwani Set', price: 2999, category: 'Mens Wear' },
  // Kids
  { name: 'Kids Frock (2-4 yr)', price: 249, category: 'Kids Wear' },
  { name: 'Kids Frock (4-6 yr)', price: 299, category: 'Kids Wear' },
  { name: 'Kids Kurta Set (Boys)', price: 299, category: 'Kids Wear' },
  // Accessories
  { name: 'Dupatta (Printed)', price: 149, category: 'Accessories' },
  { name: 'Dupatta (Embroidered)', price: 299, category: 'Accessories' },
  { name: 'Bangles Set', price: 99, category: 'Accessories' },
  { name: 'Earrings (Jhumka)', price: 149, category: 'Accessories' },
];

// ── Bakery ──────────────────────────────────────────────

export const BAKERY_SEED_DATA: SeedProduct[] = [
  // Breads
  { name: 'White Bread Loaf', price: 35, category: 'Breads' },
  { name: 'Brown Bread Loaf', price: 45, category: 'Breads' },
  { name: 'Garlic Bread', price: 80, category: 'Breads' },
  { name: 'Dinner Rolls (6 pcs)', price: 60, category: 'Breads' },
  // Cakes
  { name: 'Chocolate Cake (500g)', price: 350, category: 'Cakes' },
  { name: 'Vanilla Cake (500g)', price: 300, category: 'Cakes' },
  { name: 'Black Forest Cake (500g)', price: 400, category: 'Cakes' },
  { name: 'Pineapple Cake (500g)', price: 320, category: 'Cakes' },
  { name: 'Butterscotch Cake (500g)', price: 350, category: 'Cakes' },
  { name: 'Red Velvet Cake (500g)', price: 450, category: 'Cakes' },
  // Pastries & Muffins
  { name: 'Chocolate Pastry', price: 60, category: 'Pastries' },
  { name: 'Vanilla Pastry', price: 55, category: 'Pastries' },
  { name: 'Fruit Pastry', price: 65, category: 'Pastries' },
  { name: 'Chocolate Muffin', price: 50, category: 'Pastries' },
  { name: 'Blueberry Muffin', price: 60, category: 'Pastries' },
  // Cookies & Biscuits
  { name: 'Chocolate Chip Cookies (250g)', price: 120, category: 'Cookies' },
  { name: 'Butter Cookies (250g)', price: 100, category: 'Cookies' },
  { name: 'Nankhatai (250g)', price: 80, category: 'Cookies' },
  // Croissants & Puffs
  { name: 'Butter Croissant', price: 45, category: 'Croissants' },
  { name: 'Veg Puff', price: 25, category: 'Croissants' },
  { name: 'Cheese Croissant', price: 60, category: 'Croissants' },
  // Sweet Items
  { name: 'Brownie (1 pc)', price: 60, category: 'Sweets' },
  { name: 'Doughnut (1 pc)', price: 45, category: 'Sweets' },
  { name: 'Éclair (1 pc)', price: 30, category: 'Sweets' },
];

// ── Sweet Shop ──────────────────────────────────────────

export const SWEET_SHOP_SEED_DATA: SeedProduct[] = [
  { name: 'Gulab Jamun (250g)', price: 80, category: 'Sweets' },
  { name: 'Rasgulla (250g)', price: 70, category: 'Sweets' },
  { name: 'Jalebi (250g)', price: 60, category: 'Sweets' },
  { name: 'Barfi (250g)', price: 150, category: 'Sweets' },
  { name: 'Ladoo (250g)', price: 120, category: 'Sweets' },
  { name: 'Halwa (250g)', price: 80, category: 'Sweets' },
  { name: 'Kaju Katli (250g)', price: 300, category: 'Premium Sweets' },
  { name: 'Peda (250g)', price: 180, category: 'Sweets' },
  { name: 'Gujiya (6 pcs)', price: 60, category: 'Sweets' },
  { name: 'Imarti (250g)', price: 70, category: 'Sweets' },
  { name: 'Namkeen Mix (250g)', price: 60, category: 'Namkeen' },
  { name: 'Sev (250g)', price: 50, category: 'Namkeen' },
  { name: 'Chiwda (250g)', price: 55, category: 'Namkeen' },
];

// ── Tiffin Service ──────────────────────────────────────

export const TIFFIN_SEED_DATA: SeedProduct[] = [
  { name: 'Full Tiffin (Lunch)', price: 80, category: 'Tiffin' },
  { name: 'Full Tiffin (Dinner)', price: 80, category: 'Tiffin' },
  { name: 'Half Tiffin (Lunch)', price: 50, category: 'Tiffin' },
  { name: 'Monthly Plan (Lunch Only)', price: 1800, category: 'Plans' },
  { name: 'Monthly Plan (Both Meals)', price: 3200, category: 'Plans' },
  { name: 'Weekly Plan', price: 500, category: 'Plans' },
  { name: 'Extra Roti (2 pcs)', price: 10, category: 'Add-ons' },
  { name: 'Extra Dal', price: 20, category: 'Add-ons' },
  { name: 'Extra Rice', price: 20, category: 'Add-ons' },
  { name: 'Papad (2 pcs)', price: 5, category: 'Add-ons' },
];

// ── Pharmacy ────────────────────────────────────────────

export const PHARMACY_SEED_DATA: SeedProduct[] = [
  { name: 'Paracetamol 500mg (Strip)', price: 15, category: 'Medicines' },
  { name: 'Crocin Advance (Strip)', price: 30, category: 'Medicines' },
  { name: 'Dolo 650 (Strip)', price: 30, category: 'Medicines' },
  { name: 'Ibuprofen 400mg (Strip)', price: 20, category: 'Medicines' },
  { name: 'ORS Sachet (10 pcs)', price: 35, category: 'Medicines' },
  { name: 'Multivitamin Tablet (Strip)', price: 50, category: 'Supplements' },
  { name: 'Vitamin C 500mg (Strip)', price: 40, category: 'Supplements' },
  { name: 'Band-Aid Box (10 pcs)', price: 25, category: 'First Aid' },
  { name: 'Dettol Antiseptic 100ml', price: 65, category: 'First Aid' },
  { name: 'Thermometer (Digital)', price: 150, category: 'Devices' },
  { name: 'BP Monitor', price: 899, category: 'Devices' },
  { name: 'Surgical Mask (10 pcs)', price: 50, category: 'Hygiene' },
  { name: 'Hand Sanitizer 100ml', price: 45, category: 'Hygiene' },
];

// ── Unified export by business type ────────────────────

export const SEED_DATA_BY_TYPE = {
  shop: SHOP_SEED_DATA,
  restaurant: RESTAURANT_SEED_DATA,
  salon: SALON_SEED_DATA,
  turf: TURF_SEED_DATA,
} as const;

// ── Seed data by shop sub-category ─────────────────────
// Used in CatalogSetup to show category-specific suggestions

export const SHOP_SEED_DATA_BY_CATEGORY: Record<string, SeedProduct[]> = {
  Kirana: SHOP_SEED_DATA,
  Bakery: BAKERY_SEED_DATA,
  Boutique: BOUTIQUE_SEED_DATA,
  'Sweet Shop': SWEET_SHOP_SEED_DATA,
  Tiffin: TIFFIN_SEED_DATA,
  Pharmacy: PHARMACY_SEED_DATA,
  Other: SHOP_SEED_DATA, // fallback to kirana
};

export type BusinessTypeKey = keyof typeof SEED_DATA_BY_TYPE;
