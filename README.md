# WhatsApp Catalog Ordering Bot 🛍️

A multi-tenant SaaS that lets local shops (kirana, tiffin, bakery, boutique) take orders from customers entirely over WhatsApp — no app, no website needed.

## Architecture

```
Customer WhatsApp ──→ Meta Cloud API ──→ Webhook POST /webhook/{shop_id}
                                               │
                                               ▼
                                         MessageHandler
                                               │
                                    ┌──────────┼──────────┐
                                    ▼          ▼          ▼
                           Conversation_  Catalog_   Order_
                           Service       Service     Service
                                    │          │          │
                                    ▼          ▼          ▼
                                    Supabase PostgreSQL
                                               ▲
                                    ┌──────────┘
                                    ▼
                           SheetSyncService ←── Google Sheets
                                    │
                                    ▼
                           APScheduler (daily summary @ 9PM IST)
```

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Language  | Python 3.12 |
| Framework | FastAPI (latest) |
| Database  | Supabase (PostgreSQL) |
| WhatsApp  | Meta WhatsApp Cloud API (official webhook) |
| Sheets    | Google Sheets API via `gspread` |
| Scheduler | APScheduler |
| Validation| Pydantic v2 |
| HTTP      | httpx (async) |
| Server    | uvicorn |

## Project Structure

```
shop-bot/
├── app/
│   ├── __init__.py
│   ├── main.py              # FastAPI app, webhook routes, scheduler
│   ├── config.py             # Environment configuration
│   ├── database.py           # Supabase client singleton
│   ├── models/
│   │   ├── __init__.py
│   │   ├── shop.py           # Shop/tenant Pydantic models
│   │   ├── product.py        # Product Pydantic models
│   │   ├── conversation.py   # Conversation state machine models
│   │   └── order.py          # Order Pydantic models
│   ├── gateway/
│   │   ├── __init__.py
│   │   └── whatsapp_client.py # Meta Cloud API async client
│   ├── handlers/
│   │   ├── __init__.py
│   │   └── message_handler.py # State machine + intent parser
│   ├── services/
│   │   ├── __init__.py
│   │   ├── conversation_service.py  # Conversation CRUD + state
│   │   ├── catalog_service.py       # Product catalog operations
│   │   ├── order_service.py         # Order management + summaries
│   │   ├── notification_service.py  # Notification formatting
│   │   └── sheet_sync_service.py    # Google Sheets integration
│   └── utils/
│       ├── __init__.py
│       └── logger.py        # Structured JSON logging
├── requirements.txt
├── .env.example
└── README.md
```

## Setup

### Prerequisites

- Python 3.12+
- Supabase project (free tier works)
- Meta WhatsApp Business Account with API access
- Google Cloud project with Sheets API enabled + service account

### 1. Clone and install

```bash
git clone <repo-url> shop-bot
cd shop-bot

python -m venv .venv
source .venv/bin/activate   # Linux/Mac
# .venv\Scripts\activate    # Windows

pip install -r requirements.txt
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` with your credentials (see [Environment Variables](#environment-variables) below).

### 3. Database setup

Run the SQL in `schema.sql` in your Supabase SQL Editor to create all tables.

```bash
# Or apply via Supabase CLI:
# psql "$SUPABASE_DB_URL" -f schema.sql
```

### 4. Seed your first shop

Insert a shop record in Supabase:

```sql
INSERT INTO shops (name, whatsapp_number, owner_whatsapp_number, 
                   google_sheet_id, access_token, phone_number_id)
VALUES ('Sharma Kirana', '15551234567', '15559876543',
        'your_google_sheet_id', 'your_whatsapp_access_token', 'your_phone_number_id');
```

### 5. Run the server

```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

### 6. Configure Meta Webhook

In your Meta App dashboard → WhatsApp → Configuration:

- **Callback URL**: `https://your-domain.com/webhook/{shop_id}`
  - Replace `{shop_id}` with the UUID of your shop
  - During local development, use ngrok: `https://your-ngrok.ngrok.io/webhook/{shop_id}`
- **Verify Token**: The value you set as `WHATSAPP_VERIFY_TOKEN` in `.env`

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SUPABASE_URL` | ✅ | Your Supabase project URL |
| `SUPABASE_SERVICE_KEY` | ✅ | Supabase `service_role` key (NOT anon) |
| `META_APP_SECRET` | ✅ | Meta App client secret |
| `WHATSAPP_VERIFY_TOKEN` | ✅ | Custom token for webhook verification |
| `WHATSAPP_API_VERSION` | ✅ | Meta API version (e.g. `v22.0`) |
| `GOOGLE_SHEETS_CREDENTIALS` | ⬜ | Path to service account JSON or inline JSON |
| `LOG_LEVEL` | ⬜ | Logging level (default: `INFO`) |

## Conversation Flow

```
GREETING ──→ Welcome message ──→ BROWSING
                                      │
                            ┌─────────┴────────────┐
                            ▼                      ▼
                     Show categories          Show products
                            │                      │
                            └──────────┬───────────┘
                                       ▼
                                  Add to cart
                                       │
                            ┌──────────┴──────────┐
                            ▼                     ▼
                        Checkout (C)         More items (M)
                            │                     │
                            ▼                     └──→ back to categories
                       AWAITING_ADDRESS
                            │
                            ▼
                       AWAITING_PAYMENT (COD/UPI)
                            │
                            ▼
                       COMPLETED ──→ Order created → Notify owner
                            │
                            └──→ reset to GREETING
```

## Owner Commands

Send these from the owner's WhatsApp number:

| Command | Action |
|---------|--------|
| `accept ORDER_CODE` | Accept order → customer notified |
| `done ORDER_CODE` | Mark delivered → customer notified |
| `cancel ORDER_CODE` | Cancel order → apology sent |
| `update catalog` | Sync products from Google Sheets |
| `summary` | Get today's order summary |

## Google Sheets Format

Your catalog sheet must have these columns (header row in row 1):

| name | price | category | available |
|------|-------|----------|-----------|
| Biscuit | 10 | Snacks | TRUE |
| Cola | 20 | Beverages | TRUE |
| Cake | 15 | Bakery | FALSE |

- `name` (required): Product name
- `price` (required): Numeric price
- `category` (optional): Product category
- `available` (optional): `TRUE`/`FALSE` (defaults to true)

Sync is triggered by the `update catalog` owner command or automatically every 6 hours.

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | Health check |
| GET | `/webhook/{shop_id}` | Meta webhook verification |
| POST | `/webhook/{shop_id}` | Receive incoming WhatsApp messages |

## Daily Summary

APScheduler sends a daily order summary at **9 PM IST** to each active shop owner:

```
📊 Today's Summary - Sharma Kirana
Orders: 12
Revenue: Rs 3450
Top item: Biscuit
Pending orders: 3
```

## License

MIT
